/**
 * WooCommerce REST API service
 * Handles all communication with the remote WooCommerce store.
 */

export interface WCSetting {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  apiVersion?: string;
}

export interface WCProduct {
  id: number;
  name: string;
  slug: string;
  type: string; // simple | variable | grouped | external
  status: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
  weight: string;
  images: WCImage[];
  categories: WCCategory[];
  tags: { id: number; name: string; slug: string }[];
  attributes: WCAttribute[];
  variations: number[];
  brands?: { name: string; slug: string }[];
  meta_data?: { key: string; value: any }[];
  [key: string]: any;
}

export interface WCReview {
  id: number;
  date_created: string;
  review: string;
  rating: number;
  reviewer: string;
  reviewer_email: string;
}

export interface WCVariation {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
  image: WCImage | null;
  attributes: { id: number; name: string; option: string }[];
  [key: string]: any;
}

export interface WCCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  image?: WCImage | null;
}

export interface WCBrand {
  id: number;
  name: string;
  slug: string;
}

export interface WCImage {
  id: number;
  src: string;
  name: string;
  alt: string;
}

export interface WCAttribute {
  id: number;
  name: string;
  options: string[];
  variation: boolean;
}

function makeAuth(key: string, secret: string): string {
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
}

async function fetchWithTimeout(resource: string, options: any = {}) {
  const { timeout = 30000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(id);
  return response;
}

function buildUrl(setting: WCSetting, endpoint: string, params: Record<string, any> = {}): string {
  const version = setting.apiVersion ?? 'wc/v3';
  const base = setting.siteUrl.replace(/\/$/, '');
  const url = new URL(`${base}/wp-json/${version}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function wcFetch<T>(setting: WCSetting, endpoint: string, params: Record<string, any> = {}): Promise<T> {
  const isHttps = setting.siteUrl.startsWith('https://');
  const useHeader = isHttps;
  
  const queryParams = { ...params };
  if (!useHeader) {
    queryParams.consumer_key = setting.consumerKey;
    queryParams.consumer_secret = setting.consumerSecret;
  }

  const url = buildUrl(setting, endpoint, queryParams);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (useHeader) {
    headers.Authorization = makeAuth(setting.consumerKey, setting.consumerSecret);
  }

  let resp = await fetchWithTimeout(url, {
    headers,
    timeout: 30000,
  });

  // Fallback: If HTTPS request failed with 401 Unauthorized, it might be due to 
  // the web server stripping the Authorization header. Retry with query parameters.
  if (resp.status === 401 && useHeader) {
    const fallbackParams = {
      ...params,
      consumer_key: setting.consumerKey,
      consumer_secret: setting.consumerSecret,
    };
    const fallbackUrl = buildUrl(setting, endpoint, fallbackParams);
    
    const fallbackResp = await fetchWithTimeout(fallbackUrl, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    
    if (fallbackResp.ok) {
      return fallbackResp.json() as Promise<T>;
    }
    resp = fallbackResp;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    if (resp.status === 401) {
      throw new Error(`WooCommerce authentication failed (401). Verify Consumer Key, Consumer Secret, and ensure API permissions are set to Read or Read/Write. Server response: ${text}`);
    }
    if (resp.status === 403) {
      throw new Error(`WooCommerce authorization forbidden (403). Make sure the site URL is correct, SSL is properly configured, and the credentials belong to an active Administrator. Server response: ${text}`);
    }
    throw new Error(`WooCommerce API error ${resp.status}: ${text}`);
  }

  return resp.json() as Promise<T>;
}

export class WordPressService {
  /** Verify credentials by hitting the products endpoint */
  async testConnection(setting: WCSetting): Promise<{ ok: boolean; message: string }> {
    try {
      await wcFetch<WCProduct[]>(setting, 'products', { per_page: 1 });
      return { ok: true, message: 'Connection successful' };
    } catch (err: any) {
      return { ok: false, message: err.message ?? 'Connection failed' };
    }
  }

  /** Fetch a page of products */
  async fetchProducts(setting: WCSetting, page = 1, perPage = 20): Promise<WCProduct[]> {
    return wcFetch<WCProduct[]>(setting, 'products', { page, per_page: perPage, status: 'publish' });
  }

  /** Fetch a single product by ID */
  async fetchProductById(setting: WCSetting, productId: number): Promise<WCProduct> {
    return wcFetch<WCProduct>(setting, `products/${productId}`);
  }

  /** Fetch all categories (paginated internally) */
  async fetchAllCategories(setting: WCSetting): Promise<WCCategory[]> {
    const all: WCCategory[] = [];
    let page = 1;
    while (true) {
      const batch = await wcFetch<WCCategory[]>(setting, 'products/categories', { page, per_page: 100 });
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    return all;
  }

  /** Fetch variations for a variable product */
  async fetchVariations(setting: WCSetting, productId: number): Promise<WCVariation[]> {
    const all: WCVariation[] = [];
    let page = 1;
    while (true) {
      const batch = await wcFetch<WCVariation[]>(setting, `products/${productId}/variations`, {
        page,
        per_page: 100,
      });
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    return all;
  }

  /** Fetch reviews for a product */
  async fetchReviews(setting: WCSetting, productId: number): Promise<WCReview[]> {
    return wcFetch<WCReview[]>(setting, 'products/reviews', { product: productId });
  }

  /** Get total product count */
  async getTotalProductCount(setting: WCSetting): Promise<number> {
    const isHttps = setting.siteUrl.startsWith('https://');
    const useHeader = isHttps;
    
    const queryParams: Record<string, any> = { per_page: 1, status: 'publish' };
    if (!useHeader) {
      queryParams.consumer_key = setting.consumerKey;
      queryParams.consumer_secret = setting.consumerSecret;
    }

    const url = buildUrl(setting, 'products', queryParams);
    const headers: Record<string, string> = {};
    if (useHeader) {
      headers.Authorization = makeAuth(setting.consumerKey, setting.consumerSecret);
    }

    let resp = await fetchWithTimeout(url, {
      headers,
      timeout: 15000,
    });

    // Fallback for stripped Authorization header
    if (resp.status === 401 && useHeader) {
      const fallbackParams = {
        per_page: 1,
        status: 'publish',
        consumer_key: setting.consumerKey,
        consumer_secret: setting.consumerSecret,
      };
      const fallbackUrl = buildUrl(setting, 'products', fallbackParams);
      const fallbackResp = await fetchWithTimeout(fallbackUrl, { timeout: 15000 });
      if (fallbackResp.ok) {
        resp = fallbackResp;
      }
    }

    if (!resp.ok) throw new Error(`WC API ${resp.status}`);
    const total = parseInt(resp.headers.get('X-WP-Total') ?? '0', 10);
    return total;
  }
}

export const wordPressService = new WordPressService();
