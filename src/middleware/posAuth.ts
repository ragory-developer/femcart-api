import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';

export interface PosRequest extends Request {
  pos?: {
    id: string;
    name: string;
    consumerKey: string;
    allowedDomain: string | null;
  };
}

// In-memory caching layer for active keys to minimize DB overhead on high-frequency barcode scans
interface CachedApiKey {
  id: string;
  name: string;
  consumerKey: string;
  status: string;
  allowedDomain: string | null;
  cachedAt: number;
  lastUsedUpdated: number;
}

const keyCache = new Map<string, CachedApiKey>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache TTL
const LAST_USED_DEBOUNCE_MS = 5 * 60 * 1000; // Update DB lastUsedAt at most once every 5 minutes

export const posAuth = async (req: PosRequest, res: Response, next: NextFunction) => {
  try {
    let consumerKey = (
      req.headers['x-consumer-key'] ||
      req.headers['consumer-key'] ||
      req.headers['x-api-key'] ||
      req.query.consumer_key ||
      req.query.api_key
    ) as string | undefined;

    if (!consumerKey && req.headers.authorization?.startsWith('Bearer ck_live_')) {
      consumerKey = req.headers.authorization.substring(7).trim();
    }

    if (!consumerKey) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Missing x-consumer-key header or ?consumer_key query parameter.'
      });
    }

    consumerKey = String(consumerKey).trim();

    if (!consumerKey.startsWith('ck_live_')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid key format. Consumer key must start with "ck_live_".'
      });
    }

    const now = Date.now();
    let cached = keyCache.get(consumerKey);

    let apiKey = cached && (now - cached.cachedAt < CACHE_TTL_MS) ? cached : null;

    if (!apiKey) {
      const dbKey = await prisma.apiKey.findUnique({
        where: { consumerKey }
      });

      if (!dbKey) {
        keyCache.delete(consumerKey);
        return res.status(401).json({ success: false, message: 'Invalid Consumer Key. Key not found.' });
      }

      cached = {
        id: dbKey.id,
        name: dbKey.name,
        consumerKey: dbKey.consumerKey,
        status: dbKey.status,
        allowedDomain: dbKey.allowedDomain,
        cachedAt: now,
        lastUsedUpdated: cached?.lastUsedUpdated || 0
      };
      keyCache.set(consumerKey, cached);
      apiKey = cached;
    }

    if (apiKey.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: `Invi connection is currently ${apiKey.status}. Must be set to ACTIVE.`
      });
    }

    // Domain Whitelisting Check (Optional)
    if (apiKey.allowedDomain && apiKey.allowedDomain !== '*' && apiKey.allowedDomain.trim() !== '') {
      const allowedHosts = apiKey.allowedDomain.toLowerCase().split(',').map(d => d.trim());
      const incomingHost = (
        (req.headers.origin as string) ||
        (req.headers.host as string) ||
        ''
      ).toLowerCase();

      const isAllowed = allowedHosts.some(host => incomingHost.includes(host));
      if (!isAllowed) {
        return res.status(403).json({ success: false, message: 'Forbidden: Origin domain not whitelisted.' });
      }
    }

    // Debounced update of lastUsedAt timestamp in background
    if (cached && (now - cached.lastUsedUpdated > LAST_USED_DEBOUNCE_MS)) {
      cached.lastUsedUpdated = now;
      prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() }
      }).catch(() => {});
    }

    req.pos = {
      id: apiKey.id,
      name: apiKey.name,
      consumerKey: apiKey.consumerKey,
      allowedDomain: apiKey.allowedDomain
    };

    next();
  } catch (error) {
    next(error);
  }
};
