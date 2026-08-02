const fs = require('fs');

const content = fs.readFileSync('src/services/bulkImportService.ts', 'utf8');

const regex = /export async function commitStagingToProducts[\s\S]*/;

const newFunction = `export async function commitStagingToProducts(logId: string, includeInvalid: boolean = false) {
  let committed = 0;
  let failed = 0;

  const statusFilter = { in: includeInvalid ? ['VALID', 'INVALID'] : ['VALID'] };

  const totalValid = await prisma.importStagingRow.count({
    where: { importLogId: logId, status: statusFilter }
  });

  if (totalValid === 0) {
    return { committed, failed };
  }
  
  await prisma.importLog.update({ 
    where: { id: logId }, 
    data: { totalProducts: totalValid, imported: 0, failed: 0 } 
  });

  const BATCH_SIZE = 20;

  // 1. Process Parents first using ID chunking to avoid memory limits and infinite loops
  const parentIds = (await prisma.importStagingRow.findMany({
    where: { importLogId: logId, status: statusFilter, parentSku: null },
    select: { id: true }
  })).map(r => r.id);

  for (let i = 0; i < parentIds.length; i += BATCH_SIZE) {
    const chunkIds = parentIds.slice(i, i + BATCH_SIZE);
    const parentBatch = await prisma.importStagingRow.findMany({
      where: { id: { in: chunkIds } }
    });

    for (const row of parentBatch) {
      try {
        const safeName = row.name || 'Untitled Product';
        const baseSlug = (row as any).slug || safeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        
        const existingBySku = row.sku ? await prisma.product.findFirst({ where: { sku: row.sku } }) : null;
        
        let slug = existingBySku ? existingBySku.slug : baseSlug || \`product-\${Date.now()}\`;
        let existingBySlug = await prisma.product.findUnique({ where: { slug } });
        let counter = 1;
        while (!existingBySku && existingBySlug) {
          slug = \`\${baseSlug}-\${counter}\`;
          existingBySlug = await prisma.product.findUnique({ where: { slug } });
          counter++;
        }
        
        const existing = existingBySku || existingBySlug;

        const productData = {
          name: safeName,
          slug,
          sku: row.sku,
          price: row.price ?? 0,
          comparePrice: row.comparePrice ?? null,
          stock: row.stock ?? 0,
          description: row.description ?? '',
          brandId: row.brandName ? await getOrCreateBrand(row.brandName) : null,
          image: row.images ? (() => { try { return JSON.parse(row.images)[0]; } catch { return null; } })() : null,
          images: row.images ?? '[]',
          specialPrice: row.comparePrice ? row.price : null,
          productType: 'SIMPLE' as any,
        };

        const categoryConnections: { id: string }[] = [];
        if (row.categories) {
          const catNames = row.categories.split(',').filter(Boolean);
          for (const cat of catNames) {
            categoryConnections.push({ id: await getOrCreateCategory(cat.trim()) });
          }
        }

        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: { ...productData, categories: { set: categoryConnections } }
          });
        } else {
          await prisma.product.create({
            data: { ...productData, categories: { connect: categoryConnections } }
          });
        }

        await prisma.importStagingRow.update({
          where: { id: row.id },
          data: { status: 'IMPORTED' }
        });
        committed++;
        
        if (committed % 20 === 0) {
          await prisma.importLog.update({ where: { id: logId }, data: { imported: committed, failed } });
        }
      } catch (e: any) {
        failed++;
        await prisma.importStagingRow.update({
          where: { id: row.id },
          data: { status: 'INVALID', errors: { system: e.message } }
        });
        
        if (failed % 20 === 0) {
          await prisma.importLog.update({ where: { id: logId }, data: { imported: committed, failed } });
        }
      }
    }
  }

  // 2. Process Variants using the exact same ID chunking
  const variantIds = (await prisma.importStagingRow.findMany({
    where: { importLogId: logId, status: statusFilter, parentSku: { not: null } },
    select: { id: true }
  })).map(r => r.id);

  for (let i = 0; i < variantIds.length; i += BATCH_SIZE) {
    const chunkIds = variantIds.slice(i, i + BATCH_SIZE);
    const variantBatch = await prisma.importStagingRow.findMany({
      where: { id: { in: chunkIds } }
    });

    for (const row of variantBatch) {
      try {
        let parent = null;
        if (row.parentSku) {
          parent = await prisma.product.findFirst({ where: { sku: row.parentSku } });
          if (!parent) parent = await prisma.product.findUnique({ where: { slug: row.parentSku } });
        }

        if (!parent) {
          failed++;
          await prisma.importStagingRow.update({
            where: { id: row.id },
            data: { status: 'INVALID', errors: { parent: 'Parent product not found in database or staging.' } }
          });
          continue;
        }

        if (parent.productType === 'SIMPLE') {
          await prisma.product.update({ where: { id: parent.id }, data: { productType: 'VARIABLE' } });
        }

        const parsedAttrs = row.options ? JSON.parse(row.options) : [];
        let existingVariant = null;
        if (row.sku) {
          existingVariant = await prisma.productVariant.findFirst({ 
            where: { sku: row.sku, productId: parent.id } 
          });
        } else if (parsedAttrs.length > 0) {
          const parentVariants = await prisma.productVariant.findMany({
            where: { productId: parent.id },
            include: { attributes: true }
          });
          existingVariant = parentVariants.find(v => {
            if (v.attributes.length !== parsedAttrs.length) return false;
            return parsedAttrs.every((pa: any) => 
              v.attributes.some((va: any) => 
                va.name.toLowerCase() === pa.name.toLowerCase() && 
                va.value.toLowerCase() === pa.value.toLowerCase()
              )
            );
          }) || null;
        }

        const vData: any = {
          productId: parent.id,
          sku: row.sku || \`VAR-\${Date.now()}-\${Math.floor(Math.random() * 1000)}\`,
          price: row.price ?? parent.price,
          specialPrice: row.comparePrice ? row.price : null,
          stock: row.stock ?? 0,
          image: row.images ? (() => {
            try {
              const arr = JSON.parse(row.images);
              return arr[0] || null;
            } catch { return null; }
          })() : null,
        };

        let variant;
        if (existingVariant) {
          variant = await prisma.productVariant.update({ where: { id: existingVariant.id }, data: vData });
        } else {
          variant = await prisma.productVariant.create({ data: vData });
        }

        if (parsedAttrs.length > 0) {
          await prisma.variantAttribute.deleteMany({ where: { variantId: variant.id } });
          await prisma.variantAttribute.createMany({
            data: parsedAttrs.map((pa: any) => ({
              variantId: variant.id,
              name: pa.name,
              value: pa.value,
            }))
          });
        }

        await prisma.importStagingRow.update({
          where: { id: row.id },
          data: { status: 'IMPORTED' }
        });
        committed++;
        if (committed % 20 === 0) {
          await prisma.importLog.update({ where: { id: logId }, data: { imported: committed, failed } });
        }
      } catch (e: any) {
        failed++;
        await prisma.importStagingRow.update({
          where: { id: row.id },
          data: { status: 'INVALID', errors: { system: e.message } }
        });
        if (failed % 20 === 0) {
          await prisma.importLog.update({ where: { id: logId }, data: { imported: committed, failed } });
        }
      }
    }
  }

  await prisma.importLog.update({ 
    where: { id: logId }, 
    data: { status: 'completed', imported: committed, failed, totalProducts: committed + failed } 
  });
  
  return { committed, failed };
}
`;

const updated = content.replace(regex, newFunction);
fs.writeFileSync('src/services/bulkImportService.ts', updated);
console.log('Polished commitStagingToProducts with batch chunking!');
