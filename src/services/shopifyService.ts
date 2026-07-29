/**
 * Service to interact with Shopify Admin API
 */

export interface ShopifySetting {
  shopUrl: string;
  accessToken: string;
  apiVersion: string;
}

export const shopifyService = {
  /**
   * Test the connection to Shopify by fetching shop details
   */
  async testConnection(setting: ShopifySetting) {
    const url = `https://${setting.shopUrl}/admin/api/${setting.apiVersion}/shop.json`;
    try {
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': setting.accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData: any = await response.json().catch(() => null);
        throw new Error(errorData?.errors || response.statusText || 'Shopify connection failed');
      }

      const data: any = await response.json();
      return { ok: true, message: `Connected to ${data.shop?.name || setting.shopUrl}` };
    } catch (err: any) {
      return { ok: false, message: err.message || 'Network error connecting to Shopify' };
    }
  },

  /**
   * Fetch paginated products from Shopify
   */
  async fetchProducts(setting: ShopifySetting, limit = 10, pageInfo?: string) {
    let url = `https://${setting.shopUrl}/admin/api/${setting.apiVersion}/products.json?limit=${limit}`;
    if (pageInfo) {
      url = `https://${setting.shopUrl}/admin/api/${setting.apiVersion}/products.json?limit=${limit}&page_info=${pageInfo}`;
    }

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': setting.accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Shopify products: ${response.statusText}`);
    }

    // Extract next page URL from Link header if available
    const linkHeader = response.headers.get('Link');
    let nextPageInfo = null;
    if (linkHeader) {
      const match = linkHeader.match(/<[^>]+page_info=([^>]+)>; rel="next"/);
      if (match) {
        nextPageInfo = match[1];
      }
    }

    const data: any = await response.json();
    return {
      products: data.products || [],
      nextPageInfo,
    };
  },
  
  /**
   * Count total products in Shopify store
   */
  async getTotalProductCount(setting: ShopifySetting) {
    const url = `https://${setting.shopUrl}/admin/api/${setting.apiVersion}/products/count.json`;
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': setting.accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return 0; // fallback
    }

    const data: any = await response.json();
    return data.count || 0;
  }
};
