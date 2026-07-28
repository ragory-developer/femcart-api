import 'dotenv/config';
import app from './app';
import { config } from './config';
import prisma from './config/database';

import mediaCleanupJob from './jobs/mediaCleanupJob';
import logger from './utils/logger';

const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // PERF-007: Recover stuck import tasks
    const stuckImports = await prisma.importTask.updateMany({
      where: { status: 'running' },
      data: { status: 'paused', details: 'Paused due to server restart' }
    });
    if (stuckImports.count > 0) {
      logger.info(`Paused ${stuckImports.count} stuck import task(s)`);
    }

    // Test WooCommerce connection if environment credentials are set
    if (config.woocommerce.siteUrl && config.woocommerce.consumerKey && config.woocommerce.consumerSecret) {
      logger.info('Verifying WooCommerce connection from env settings...');
      try {
        const { wordPressService } = await import('./services/wordpressService');
        const connection = await wordPressService.testConnection(config.woocommerce);
        if (connection.ok) {
          logger.info('WooCommerce connection verified successfully');
          
          // Auto-seed/sync credentials into database if database has none
          const existing = await prisma.wordPressSetting.findFirst();
          if (!existing) {
            const { encrypt } = await import('./controllers/WordpressController');
            await prisma.wordPressSetting.create({
              data: {
                siteUrl: config.woocommerce.siteUrl.replace(/\/$/, ''),
                consumerKey: encrypt(config.woocommerce.consumerKey),
                consumerSecret: encrypt(config.woocommerce.consumerSecret),
                apiVersion: 'wc/v3',
              }
            });
            logger.info('WooCommerce credentials auto-seeded to database from env');
          }
        } else {
          logger.error('[WooCommerce] Start-up connection test failed. Please verify Consumer Key, Consumer Secret, URL and permissions.', new Error(connection.message));
        }
      } catch (err: any) {
        logger.error('[WooCommerce] Error testing connection during startup', err);
      }
    } else {
      logger.info('WooCommerce environment credentials not set. Relying on database settings.');
    }

    app.listen(config.port, () => {
      logger.info(`🚀 Femcart API running on http://localhost:${config.port}`);
      logger.info(`📋 Health check: http://localhost:${config.port}/api/health`);
      logger.info(`🔥 Dashboard stats mounted: /api/user-dashboard/stats`);
      logger.info(`🌍 Environment: ${config.nodeEnv}`);
      
      // Start background jobs

      mediaCleanupJob.start();
      logger.info('Background jobs started (Cart cleanup, Media cleanup)');
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

// Global unhandled error handlers for production reliability
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise) => {
  logger.error('UNHANDLED REJECTION! 💥', { reason, promise });
  // Avoid immediate process.exit(1) on unhandledRejection to allow logger to flush, or exit gracefully.
  // We can let the uncaughtException handle catastrophic failures.
});


startServer();

// Trigger restart 4
 
