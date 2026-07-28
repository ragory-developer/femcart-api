/**
 * Centralized utility for generating Redis cache keys.
 * Using a factory ensures a strict taxonomy and avoids collisions.
 */
const PREFIX = 'femcart';

export const KeyFactory = {
  globalSettings: () => `${PREFIX}:settings:global`,
  otp: (phone: string) => `${PREFIX}:otp:${phone}`,
  category: (slug: string) => `${PREFIX}:category:${slug}`,
  allCategories: () => `${PREFIX}:categories:all`,
  cart: (userId: string) => `${PREFIX}:cart:${userId}`,
  session: (token: string) => `${PREFIX}:session:${token}`,
  
  // Product Caching
  productCacheVersion: () => `${PREFIX}:products:version`,
  productList: (version: string, queryHash: string) => `${PREFIX}:products:list:v${version}:${queryHash}`,
  productDetail: (version: string, slug: string) => `${PREFIX}:products:detail:v${version}:${slug}`,
  
  // Category Caching
  categoryCacheVersion: () => `${PREFIX}:categories:version`,
  categoryList: (version: string) => `${PREFIX}:categories:list:v${version}`,
  
  // Brand Caching
  brandCacheVersion: () => `${PREFIX}:brands:version`,
  brandList: (version: string) => `${PREFIX}:brands:list:v${version}`,
};
