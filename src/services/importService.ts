/**
 * Core import service — maps WooCommerce data to Femcart schema and persists it.
 */

import prisma from '../config/database';
import { config } from '../config/index';
import { downloadAndSaveImage } from './imageService';
import { WCProduct, WCSetting, WCVariation, wordPressService } from './wordpressService';
import { CacheService } from '../core/redis/CacheService';
import { KeyFactory } from '../core/redis/KeyFactory';

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(base: string, existingId?: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (true) {
    const found = await prisma.product.findUnique({ where: { slug } });
    if (!found || found.id === existingId) break;
    slug = `${base}-${counter++}`;
  }
  return slug;
}

// ─── Category import ─────────────────────────────────────────────────────────

/** Cache: wc_category_id → our category id */
const catCache = new Map<number, string>();
let categoryImportPromise: Promise<Map<number, string>> | null = null;

export async function importCategories(setting: WCSetting): Promise<Map<number, string>> {
  // Return immediately if already cached in memory
  if (catCache.size > 0) return catCache;

  // If currently fetching/syncing, wait for that same promise
  if (categoryImportPromise) return categoryImportPromise;

  categoryImportPromise = (async () => {
    try {
      const wcCats = await wordPressService.fetchAllCategories(setting);
      const sorted = [...wcCats].sort((a, b) => a.parent - b.parent);

      for (const wc of sorted) {
        if (catCache.has(wc.id)) continue;

        const slug = wc.slug || slugify(wc.name);
        let parentId: string | undefined;
        if (wc.parent && catCache.has(wc.parent)) {
          parentId = catCache.get(wc.parent);
        }

        let image: string | undefined;
        if (wc.image?.src) {
          try { 
            const res = await downloadAndSaveImage(wc.image.src, wc.name); 
            image = res.startsWith('http') ? res : `${config.apiUrl}${res}`;
          } catch { /* ignore */ }
        }

        const category = await prisma.category.upsert({
          where: { slug },
          update: { name: wc.name, parentId: parentId ?? null },
          create: { name: wc.name, slug, image, parentId: parentId ?? null },
        });

        catCache.set(wc.id, category.id);
      }
      return catCache;
    } finally {
      // Keep result in catCache, but allow re-check promise if needed later 
      // (though catCache being populated will make it fast anyway)
      categoryImportPromise = null;
    }
  })();

  return categoryImportPromise;
}

// ─── Brand import ─────────────────────────────────────────────────────────────

const brandCache = new Map<string, string>(); // brand slug → our brand id

async function getOrCreateBrand(name: string): Promise<string> {
  const slug = slugify(name);
  if (brandCache.has(slug)) return brandCache.get(slug)!;

  const brand = await prisma.brand.upsert({
    where: { slug },
    update: { name },
    create: { name, slug },
  });

  brandCache.set(slug, brand.id);
  return brand.id;
}

// ─── Single product import ────────────────────────────────────────────────────

export async function importProduct(
  wcProduct: WCProduct,
  setting: WCSetting,
  catMap: Map<number, string>,
  logFn?: (msg: string) => void
): Promise<'created' | 'updated' | 'skipped'> {
  const externalId = `wc_${wcProduct.id}`;
  logFn && logFn(`⬇️ Processing "${wcProduct.name}" (ID: ${wcProduct.id})`);

  // ── Price ──
  const rawPrice = parseFloat(wcProduct.regular_price || wcProduct.price || '0');
  const priceVal = isNaN(rawPrice) ? 0 : rawPrice;
  const rawSale = parseFloat(wcProduct.sale_price || '');
  const specialPrice = isNaN(rawSale) ? undefined : rawSale;

  // ── Main image ──
  let mainImage: string | undefined;
  const mainImgSrc = wcProduct.images?.[0]?.src;
  if (mainImgSrc) {
    try { 
      logFn && logFn(`  🖼️ Downloading main image...`);
      const res = await downloadAndSaveImage(mainImgSrc, wcProduct.images[0].alt || wcProduct.name); 
      mainImage = res.startsWith('http') ? res : `${config.apiUrl}${res}`;
      logFn && logFn(`  ✔️ Main image saved.`);
    } catch (e: any) { 
      console.error('Main image fail:', e.message);
      logFn && logFn(`  ❌ Main image download failed: ${e.message}`);
    }
  }

  // ── Gallery images ──
  const galleryImages: string[] = [];
  const extraImages = (wcProduct.images ?? []).slice(1);
  if (extraImages.length > 0) {
    logFn && logFn(`  🖼️ Downloading ${extraImages.length} gallery images...`);
    for (const img of extraImages) {
      try {
        const saved = await downloadAndSaveImage(img.src, img.alt || wcProduct.name);
        galleryImages.push(saved.startsWith('http') ? saved : `${config.apiUrl}${saved}`);
      } catch (e: any) { 
        console.error('Gallery image fail:', e.message); 
        logFn && logFn(`  ❌ Gallery image failed: ${e.message}`);
      }
    }
    logFn && logFn(`  ✔️ Gallery images saved.`);
  }

  // ── Categories ──
  const categoryIds = (wcProduct.categories ?? [])
    .map((c) => catMap.get(c.id))
    .filter(Boolean) as string[];

  // ── Brand ──
  let brandId: string | undefined;
  // WC stores brand in an attribute OR custom taxonomy. Check both.
  const brandAttr = (wcProduct.attributes ?? []).find(
    (a) => a.name.toLowerCase() === 'brand' || a.name.toLowerCase() === 'brands'
  );
  if (brandAttr?.options?.[0]) {
    try { brandId = await getOrCreateBrand(brandAttr.options[0]); } catch { /* */ }
  }
  if (!brandId && wcProduct.brands?.[0]) {
    try { brandId = await getOrCreateBrand(wcProduct.brands[0].name); } catch { /* */ }
  }

  // ── Slug ──
  const existing = await prisma.product.findFirst({ where: { externalId } });
  logFn && logFn(`  🛠️ ${existing ? 'Updating' : 'Creating'} core product record...`);
  const baseSlug = wcProduct.slug || slugify(wcProduct.name);
  const slug = existing ? (existing as any).slug : await uniqueSlug(baseSlug, (existing as any)?.id);

  // ── Product type ──
  const isVariable = wcProduct.type === 'variable' && (wcProduct.variations?.length ?? 0) > 0;
  const productType = isVariable ? 'VARIABLE' : 'SIMPLE';

  // ── SEO Data ──
  const seoData: Record<string, any> = {};
  if (wcProduct.meta_data) {
    for (const meta of wcProduct.meta_data) {
      if (typeof meta.key === 'string' && (meta.key.includes('seo') || meta.key.includes('rank_math') || meta.key.includes('yoast'))) {
        seoData[meta.key] = meta.value;
      }
    }
  }
  const finalSeoData = Object.keys(seoData).length > 0 ? seoData : null;

  // ── Product data preparation ──
  const productData: any = {
    externalId,
    name: wcProduct.name,
    slug,
    productType: productType as any,
    description: wcProduct.description ?? '',
    shortDescription: wcProduct.short_description ?? '',
    price: priceVal,
    specialPrice: specialPrice ?? null,
    stock: wcProduct.stock_quantity ?? 0,
    weight: wcProduct.weight || null,
    brandId: brandId ?? null,
    seoData: finalSeoData ? JSON.stringify(finalSeoData) : null,
    averageRating: parseFloat(wcProduct.average_rating || '0'),
    ratingCount: wcProduct.rating_count || 0,
    images: JSON.stringify(galleryImages),
  };

  const categoryConnections = categoryIds.map((id) => ({ id }));

  if (mainImage) (productData as any).image = mainImage;

  // ── Product upsert ──
  const product = await prisma.product.upsert({
    where: { externalId },
    update: {
      ...productData,
      image: mainImage ?? undefined,
      categories: { set: categoryConnections },
    },
    create: {
      ...productData,
      image: mainImage ?? null,
      categories: { connect: categoryConnections },
    },
    include: { categories: true, brand: true, variants: true }
  });

  // ── Import Reviews ──
  if (wcProduct.rating_count > 0) {
    logFn && logFn(`  ⭐ Fetching reviews from WooCommerce...`);
    try {
      const wcReviews = await wordPressService.fetchReviews(setting, wcProduct.id);
      for (const r of wcReviews) {
        await (prisma as any).review.upsert({
          where: { externalId: `wc_rev_${r.id}` },
          update: {
            rating: r.rating,
            content: r.review,
            reviewer: r.reviewer,
            reviewerEmail: r.reviewer_email,
          },
          create: {
            productId: product.id,
            externalId: `wc_rev_${r.id}`,
            rating: r.rating,
            content: r.review,
            reviewer: r.reviewer,
            reviewerEmail: r.reviewer_email,
            createdAt: new Date(r.date_created),
          }
        });
      }
      logFn && logFn(`  ✔️ ${wcReviews.length} reviews imported.`);
    } catch (e: any) {
      logFn && logFn(`  ⚠️ Failed to import reviews: ${e.message}`);
    }
  }

  // ── Variants for variable products ──
  if (isVariable) {
    logFn && logFn(`  ⚙️ Fetching variations from WooCommerce...`);
    try {
      const variations: WCVariation[] = await wordPressService.fetchVariations(setting, wcProduct.id);
      logFn && logFn(`  ⚙️ Processing ${variations.length} variations...`);
      for (const v of variations) {
        const vPrice = parseFloat(v.regular_price || v.price || String(priceVal)) || priceVal;
        const vSale = parseFloat(v.sale_price ?? '');
        const vSpecial = isNaN(vSale) ? undefined : vSale;

        let vImage: string | undefined;
        if (v.image?.src) {
          try { 
            const res = await downloadAndSaveImage(v.image.src, v.image.alt || wcProduct.name); 
            vImage = res.startsWith('http') ? res : `${config.apiUrl}${res}`;
          } catch (e: any) { console.error('Variant image fail:', e.message); }
        }

        // Check if variant exists (by sku or externalId stored in sku field)
        const extVarId = `wc_var_${v.id}`;
        const existingVar = await prisma.productVariant.findFirst({
          where: { productId: product.id, sku: extVarId },
        });

        const attrData = (v.attributes ?? []).map((a) => ({ name: a.name, value: a.option }));

        if (existingVar) {
          await prisma.productVariant.update({
            where: { id: existingVar.id },
            data: {
              price: vPrice,
              specialPrice: vSpecial ?? null,
              stock: v.stock_quantity ?? 0,
              image: vImage ?? null,
              attributes: {
                deleteMany: {},
                create: attrData,
              },
            },
          });
        } else {
          await prisma.productVariant.create({
            data: {
              productId: product.id,
              sku: extVarId,
              price: vPrice,
              specialPrice: vSpecial ?? null,
              stock: v.stock_quantity ?? 0,
              image: vImage ?? null,
              isDefault: false,
              enabled: true,
              attributes: { create: attrData },
            },
          });
        }
      }

      // Mark first variant as default if none is
      const defaultExists = await prisma.productVariant.findFirst({
        where: { productId: product.id, isDefault: true },
      });
      if (!defaultExists) {
        const first = await prisma.productVariant.findFirst({ where: { productId: product.id } });
        if (first) await prisma.productVariant.update({ where: { id: first.id }, data: { isDefault: true } });
      }
    } catch (err: any) {
      console.error(`Variant fetch failed for WC product ${wcProduct.id}:`, err.message);
    }
  }

  logFn && logFn(`✅ Completed "${wcProduct.name}". Status: ${existing ? 'updated' : 'created'}`);
  
  // Invalidate product cache
  await CacheService.incr(KeyFactory.productCacheVersion());
  
  return existing ? 'updated' : 'created';
}
