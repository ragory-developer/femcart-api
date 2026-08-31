import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

export interface PosRequest extends Request {
  pos?: {
    id: string;
    name: string;
    consumerKey: string;
    authMode: string;
    permissions: string;
    webhookUrl: string | null;
    webhookSecret: string | null;
  };
}

/**
 * Validates Invi/POS requests using Single Consumer Key:
 *  - Header: x-consumer-key, x-api-key, or Authorization: Bearer <key>
 *  - Query: ?consumer_key=... or ?api_key=...
 */
export const posAuth = async (req: PosRequest, _res: Response, next: NextFunction) => {
  let consumerKey: string | undefined;
  let isAdminAuthenticated = false;

  // 1. Check HTTP Headers (x-consumer-key, consumer-key, x-api-key, api-key)
  const headerKey = (req.headers['x-consumer-key'] || req.headers['consumer-key'] || req.headers['x-api-key'] || req.headers['api-key']) as string;
  if (headerKey) consumerKey = headerKey.trim();

  // 2. Check Authorization: Bearer <token> (Can be consumer key starting with ck_live_ OR Admin JWT)
  if (!consumerKey && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const bearerToken = req.headers.authorization.substring(7).trim();
    if (bearerToken.startsWith('ck_live_')) {
      consumerKey = bearerToken;
    } else {
      // Test if it's an Admin JWT
      try {
        const decoded = jwt.verify(bearerToken, config.jwt.accessSecret) as { userId: string; role: string };
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, role: true }
        });
        if (user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
          isAdminAuthenticated = true;
          return next();
        }
      } catch {
        // Not a valid admin token, proceed
      }
    }
  }

  // 3. Check Query Parameters (?consumer_key=... or ?api_key=...)
  if (!consumerKey && (req.query.consumer_key || req.query.api_key)) {
    consumerKey = ((req.query.consumer_key || req.query.api_key) as string).trim();
  }

  if (!consumerKey) {
    return next(
      new UnauthorizedError(
        'Missing Invi API Key. Provide x-consumer-key header, x-api-key header, or ?consumer_key query parameter.'
      )
    );
  }

  // Basic format validation
  if (!consumerKey.startsWith('ck_live_')) {
    return next(
      new UnauthorizedError('Invalid key format. Consumer key must start with "ck_live_".')
    );
  }

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { consumerKey }
    });

    if (!apiKey) {
      return next(new UnauthorizedError('Invalid Consumer Key. Key does not exist.'));
    }

    // Check status
    if (apiKey.status !== 'ACTIVE') {
      return next(
        new ForbiddenError(
          `Invi connection is currently ${apiKey.status}. An admin must set it to ACTIVE in Admin Settings.`
        )
      );
    }

    // Domain & Origin Whitelisting Verification (skipped for admin dashboard ping)
    if (!isAdminAuthenticated && apiKey.allowedDomain && apiKey.allowedDomain.trim() !== '' && apiKey.allowedDomain !== '*') {
      const allowedList = apiKey.allowedDomain
        .toLowerCase()
        .split(',')
        .map((d: string) => d.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]);

      // Extract client domain / origin / IP
      const originHeader = (req.headers['origin'] || req.headers['referer']) as string | undefined;
      const hostHeader = (req.headers['x-forwarded-host'] || req.headers['host']) as string | undefined;
      const clientIp = (req.headers['x-forwarded-for'] as string || req.ip || req.socket.remoteAddress || '')
        .split(',')[0].trim().replace(/^::ffff:/, '');

      let requestHost = '';
      if (originHeader) {
        try {
          requestHost = new URL(originHeader).hostname.toLowerCase();
        } catch {
          requestHost = originHeader.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0].toLowerCase();
        }
      } else if (hostHeader) {
        requestHost = hostHeader.split(':')[0].toLowerCase();
      }

      const isDomainAllowed = allowedList.some((allowed) => {
        if (allowed === '*' || allowed === '') return true;
        if (requestHost === allowed) return true;
        if (clientIp === allowed) return true;
        if (allowed.startsWith('*.') && requestHost.endsWith(allowed.slice(2))) return true;
        return false;
      });

      if (!isDomainAllowed) {
        return next(
          new ForbiddenError(
            `Access Denied: Request domain/host (${requestHost || clientIp || 'unknown'}) is not in the allowed domain whitelist for this Invi key.`
          )
        );
      }
    }

    // Update lastUsedAt asynchronously
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    }).catch(() => { });

    req.pos = {
      id: apiKey.id,
      name: apiKey.name,
      consumerKey: apiKey.consumerKey,
      authMode: apiKey.authMode,
      permissions: apiKey.permissions,
      webhookUrl: apiKey.webhookUrl,
      webhookSecret: apiKey.webhookSecret
    };

    next();
  } catch (error) {
    next(error);
  }
};
