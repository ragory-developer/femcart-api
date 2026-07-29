import prisma from '../config/database';
import { ProductType } from '@prisma/client';
import { downloadAndSaveImage } from './imageService';
import { ShopifySetting } from './shopifyService';
import { slugify } from '../utils/helpers'; // Assuming we have a slugify helper, or we can just use handle

export const shopifyImportService = {
  async processProduct(shopifyProduct: any, imageStorageStrategy: string = 'AWS_S3') {
    const { id, title, handle, body_html, vendor, product_type, tags, variants, images } = shopifyProduct;
    
    const externalId = `shopify_${id}`;
    let productType: ProductType = variants.length > 1 ? ProductType.VARIABLE : ProductType.SIMPLE;

    // 1. Process Brand (Vendor)
    let brandId = null;
    if (vendor) {
      const brandSlug = vendor.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const brand = await prisma.brand.upsert({
        where: { slug: brandSlug },
        update: {},
        create: { name: vendor, slug: brandSlug },
      });
      brandId = brand.id;
    }

    // 2. Process Categories (Product Type as Category)
    const categoryIds: string[] = [];
    if (product_type) {
      const catSlug = product_type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const category = await prisma.category.upsert({
        where: { slug: catSlug },
        update: {},
        create: { name: product_type, slug: catSlug },
      });
      categoryIds.push(category.id);
    }

    // 3. Process Tags
    const tagIds: string[] = [];
    if (tags) {
      const tagList = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
      for (const t of tagList) {
        const tagSlug = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const tag = await prisma.tag.upsert({
          where: { slug: tagSlug },
          update: {},
          create: { name: t, slug: tagSlug },
        });
        tagIds.push(tag.id);
      }
    }

    // 4. Process Images
    let mainImage = '';
    const galleryImages: string[] = [];
    if (images && images.length > 0) {
      const results = await Promise.allSettled(
        images.map((img: any) => downloadAndSaveImage(img.src, imageStorageStrategy))
      );
      
      const savedUrls = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && !!r.value)
        .map(r => r.value);
        
      if (savedUrls.length > 0) {
        mainImage = savedUrls[0];
        galleryImages.push(...savedUrls.slice(1));
      }
    }

    // 5. Process Base Pricing & Inventory from first variant
    const firstVariant = variants[0] || {};
    const price = firstVariant.price ? parseFloat(firstVariant.price) : 0;
    const specialPrice = firstVariant.compare_at_price ? parseFloat(firstVariant.compare_at_price) : null;
    const sku = firstVariant.sku || '';
    const stock = firstVariant.inventory_quantity || 0;
    const weight = firstVariant.weight ? firstVariant.weight.toString() : null;
    const manageStock = firstVariant.inventory_management === 'shopify';
    const isVirtual = firstVariant.requires_shipping === false;

    // 6. Create or Update Product
    const product = await prisma.product.upsert({
      where: { externalId },
      update: {
        name: title,
        slug: handle,
        description: body_html || '',
        price,
        specialPrice,
        sku,
        stock,
        weight,
        manageStock,
        isVirtual,
        productType,
        brandId,
        image: mainImage || undefined,
        images: JSON.stringify(galleryImages),
        categories: categoryIds.length > 0 ? { set: categoryIds.map(id => ({ id })) } : undefined,
        tags: tagIds.length > 0 ? { set: tagIds.map(id => ({ id })) } : undefined,
      },
      create: {
        externalId,
        name: title,
        slug: handle,
        description: body_html || '',
        price,
        specialPrice,
        sku,
        stock,
        weight,
        manageStock,
        isVirtual,
        productType,
        brandId,
        image: mainImage,
        images: JSON.stringify(galleryImages),
        categories: { connect: categoryIds.map(id => ({ id })) },
        tags: { connect: tagIds.map(id => ({ id })) },
      },
    });

    // 7. Process Variations if variable product
    if (productType === 'VARIABLE' && variants.length > 0) {
      for (const variant of variants) {
        const variantSku = variant.sku || '';
        const variantPrice = variant.price ? parseFloat(variant.price) : price;
        const variantSpecialPrice = variant.compare_at_price ? parseFloat(variant.compare_at_price) : null;
        const variantStock = variant.inventory_quantity || 0;
        const variantWeight = variant.weight ? variant.weight.toString() : null;
        const vExternalId = `shopify_var_${variant.id}`;

        await prisma.productVariant.upsert({
          where: { externalId: vExternalId },
          update: {
            sku: variantSku,
            price: variantPrice,
            specialPrice: variantSpecialPrice,
            stock: variantStock,
            weight: variantWeight,
          },
          create: {
            externalId: vExternalId,
            productId: product.id,
            sku: variantSku,
            price: variantPrice,
            specialPrice: variantSpecialPrice,
            stock: variantStock,
            weight: variantWeight,
            attributes: {
              create: [
                ...(variant.option1 && variant.option1 !== 'Default Title' ? [{ name: 'Option1', value: String(variant.option1) }] : []),
                ...(variant.option2 ? [{ name: 'Option2', value: String(variant.option2) }] : []),
                ...(variant.option3 ? [{ name: 'Option3', value: String(variant.option3) }] : [])
              ]
            }
          }
        });
      }
    }

    return product;
  }
};
