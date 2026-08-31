import { Request, Response, NextFunction } from 'express';
import { apiKeyService } from '../services/apiKeyService';
import crypto from 'crypto';

export class ApiKeyController {

  /**
   * Admin: Generate a new Invi API connection (Single Consumer Key)
   */
  public registerConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, allowedDomain, webhookUrl, permissions } = req.body;

      const keyData = await apiKeyService.registerConnection(name, allowedDomain, webhookUrl, permissions);
      res.status(201).json({
        message: 'Invi API Key generated successfully.',
        data: keyData
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: List all POS connections
   */
  public listConnections = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const connections = await apiKeyService.listConnections();
      res.status(200).json(connections);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: Toggle Active <-> Inactive status
   */
  public toggleStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await apiKeyService.toggleStatus(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: Approve connection (Set to ACTIVE)
   */
  public approveConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await apiKeyService.approveConnection(id);
      res.status(200).json({ message: 'Connection activated', data: result });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: Revoke connection
   */
  public revokeConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await apiKeyService.revokeConnection(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: Permanently delete connection
   */
  public deleteConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await apiKeyService.deleteConnection(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: View live inventory audit ledger
   */
  public getInventoryLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, search, source } = req.query;
      const result = await apiKeyService.getInventoryLogs({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search as string,
        source: source as string
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: Get INVI integration settings (Sync toggles, Webhook secret, Outbound URLs)
   */
  public getInviSettings = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { getSetting, getSettingBool } = await import('../utils/settings');
      const invi_master_enabled = await getSettingBool('invi_master_enabled', true);
      const invi_webhook_enabled = await getSettingBool('invi_webhook_enabled', true);
      const invi_manual_api_enabled = await getSettingBool('invi_manual_api_enabled', true);
      const invi_auto_push_orders = await getSettingBool('invi_auto_push_orders', true);
      const invi_auto_sync_interval = Number(await getSetting('invi_auto_sync_interval', '0'));
      const invi_webhook_secret = await getSetting('invi_webhook_secret', process.env.INVI_WEBHOOK_SECRET || 'femcart_invi_webhook_secret_2026');
      const invi_outbound_api_url = await getSetting('invi_outbound_api_url', process.env.INVI_API_URL || 'https://invi.ragory.com/api/ecom/orders/create');
      const invi_outbound_token = await getSetting('invi_outbound_token', process.env.INVI_ACCESS_TOKEN || '');

      res.status(200).json({
        success: true,
        data: {
          invi_master_enabled,
          invi_webhook_enabled,
          invi_manual_api_enabled,
          invi_auto_push_orders,
          invi_auto_sync_interval,
          invi_webhook_secret,
          invi_outbound_api_url,
          invi_outbound_token
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: Update INVI integration settings
   */
  public updateInviSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { setSetting } = await import('../utils/settings');
      const {
        invi_master_enabled,
        invi_webhook_enabled,
        invi_manual_api_enabled,
        invi_auto_push_orders,
        invi_auto_sync_interval,
        invi_webhook_secret,
        invi_outbound_api_url,
        invi_outbound_token
      } = req.body;

      if (invi_master_enabled !== undefined) await setSetting('invi_master_enabled', String(Boolean(invi_master_enabled)));
      if (invi_webhook_enabled !== undefined) await setSetting('invi_webhook_enabled', String(Boolean(invi_webhook_enabled)));
      if (invi_manual_api_enabled !== undefined) await setSetting('invi_manual_api_enabled', String(Boolean(invi_manual_api_enabled)));
      if (invi_auto_push_orders !== undefined) await setSetting('invi_auto_push_orders', String(Boolean(invi_auto_push_orders)));
      if (invi_auto_sync_interval !== undefined) await setSetting('invi_auto_sync_interval', String(Number(invi_auto_sync_interval)));
      
      if (typeof invi_webhook_secret === 'string' && invi_webhook_secret.trim()) {
        await setSetting('invi_webhook_secret', invi_webhook_secret.trim());
      }
      if (typeof invi_outbound_api_url === 'string') {
        await setSetting('invi_outbound_api_url', invi_outbound_api_url.trim());
      }
      if (typeof invi_outbound_token === 'string') {
        await setSetting('invi_outbound_token', invi_outbound_token.trim());
      }

      res.status(200).json({
        success: true,
        message: 'INVI POS Integration settings updated successfully.'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Ping the configured outbound URL to test connectivity
   */
  public testOutboundConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, token } = req.body;
      if (!url) return res.status(400).json({ success: false, message: 'URL is required for testing.' });

      const payload = { event: 'ping', timestamp: new Date().toISOString(), data: { message: 'Test from Femcart' } };
      const rawBody = JSON.stringify(payload);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Femcart-Webhook-Test/1.0'
      };
      
      if (token) {
        // Send token in multiple common formats to maximize compatibility with the external POS
        headers['Authorization'] = `Bearer ${token}`; // Standard Bearer
        headers['X-API-Key'] = token; // Common API Key header
        headers['token'] = token; // Common custom header
        headers['x-consumer-key'] = token; // Used in Inbound API
        headers['x-consumer-secret'] = token; // Used in Inbound API
        
        // Standard Webhooks expect HMAC signature
        const signature = crypto.createHmac('sha256', token).update(rawBody).digest('hex');
        headers['x-femcart-signature'] = signature;
        headers['x-invi-signature'] = signature;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: rawBody,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const responseText = await response.text();
        
        if (response.ok) {
          return res.status(200).json({ 
            success: true, 
            message: `Connection successful (${response.status})`, 
            data: responseText.slice(0, 500)
          });
        } else {
          return res.status(400).json({ 
            success: false, 
            message: `Connection failed with status ${response.status}`, 
            data: responseText.slice(0, 500)
          });
        }
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        return res.status(400).json({ 
          success: false, 
          message: `Network error or timeout: ${fetchErr.message}` 
        });
      }
    } catch (error) {
      next(error);
    }
  };
}

export const apiKeyController = new ApiKeyController();
