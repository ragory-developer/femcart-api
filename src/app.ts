import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import logger from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiters';
import prisma from './config/database';

// Import routes

import apiRoutes from './routes';
// All old route imports removed in favor of routes/index.ts
import path from 'path';
import { setupSwagger } from './config/swagger';
import { UserController } from './controllers/UserController';
import { authenticate } from './middleware/auth';
import { requestIdMiddleware } from './middleware/requestId';

const app = express();

app.use(requestIdMiddleware);

// Trust proxy for rate limiting (needed for Coolify/Traefik)
app.set('trust proxy', 1);
// --- Swagger Documentation ---
setupSwagger(app);

// --- Security Middleware ---
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow images to load across origins if needed
}));

// --- Basic Middleware ---
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.allowAllOrigins || config.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (config.nodeEnv === 'production') {
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => logger.http(message.trim())
    }
  }));
} else {
  app.use(morgan('dev'));
}


import { decrypt } from './controllers/WordpressController';
import { wordPressService } from './services/wordpressService';
import { catalogIntegrityService } from './services/CatalogIntegrityService';

// --- Health check ---
app.get('/api/health', async (_req, res) => {
  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'error', message: 'Not connected' },
      woocommerce: { status: 'disabled', message: 'Not configured' },
      catalogIntegrity: { status: 'ok', totalIssues: 0 },
      redis: { status: 'ok', message: 'Mocked (not configured)' }
    }
  };

  let hasError = false;

  // 1. Database Check
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = { status: 'ok', message: 'Connected' };
  } catch (err: any) {
    hasError = true;
    health.services.database = { status: 'error', message: err.message || 'Query failed' };
  }

  // 2. WooCommerce Check
  try {
    let activeSetting = null;
    if (config.woocommerce.siteUrl && config.woocommerce.consumerKey && config.woocommerce.consumerSecret) {
      activeSetting = {
        siteUrl: config.woocommerce.siteUrl,
        consumerKey: config.woocommerce.consumerKey,
        consumerSecret: config.woocommerce.consumerSecret
      };
    } else {
      const row = await prisma.wordPressSetting.findFirst({ orderBy: { updatedAt: 'desc' } });
      if (row) {
        activeSetting = {
          siteUrl: row.siteUrl,
          consumerKey: decrypt(row.consumerKey),
          consumerSecret: decrypt(row.consumerSecret),
          apiVersion: row.apiVersion
        };
      }
    }

    if (activeSetting) {
      const test = await wordPressService.testConnection(activeSetting);
      if (test.ok) {
        health.services.woocommerce = { status: 'ok', message: 'Connection verified' };
      } else {
        health.services.woocommerce = { status: 'error', message: test.message };
      }
    }
  } catch (err: any) {
    health.services.woocommerce = { status: 'error', message: err.message || 'WooCommerce check failed' };
  }

  // 3. Catalog Integrity Check
  try {
    const integrity = await catalogIntegrityService.checkIntegrity();
    health.services.catalogIntegrity = {
      status: integrity.summary.hasErrors ? 'degraded' : 'ok',
      totalIssues: integrity.summary.totalIssues,
      summary: integrity.summary,
      duplicateSlugsCount: integrity.duplicateSlugs.length,
      orphanedProductsCount: integrity.orphanedProducts.length,
      invalidCartItemsCount: integrity.invalidCartItems.length,
      invalidOrderItemsCount: integrity.invalidOrderItems.length,
      brokenImportsCount: integrity.brokenImports.length
    };
  } catch (err: any) {
    health.services.catalogIntegrity = { status: 'error', message: err.message || 'Catalog check failed' };
  }

  if (hasError) {
    health.status = 'error';
    res.status(500).json(health);
  } else {
    res.json(health);
  }
});



// --- API Routes ---
app.use('/api', apiRoutes);
const userController = new UserController();
app.get('/api/user-stats-service/stats', authenticate, userController.getDashboardStats);
// Routes are now managed via apiRoutes

// --- 404 handler ---
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// --- Global error handler ---
app.use(errorHandler);

export default app;
