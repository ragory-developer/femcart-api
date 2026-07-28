import { Application } from 'express';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { config } from './index';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Femcart API Documentation',
      version: '1.0.0',
      description: 'API documentation for the Femcart e-commerce backend.',
    },
    servers: [
      // Primary server based on the active environment
      ...(config.nodeEnv === 'production'
        ? [{ url: config.apiUrl, description: 'Production Server' }]
        : [{ url: `http://localhost:${config.port}`, description: 'Local Development Server' }]
      ),
      // Secondary fallback server (only if different from primary)
      ...(config.nodeEnv === 'production'
        ? (config.apiUrl !== `http://localhost:${config.port}` ? [{ url: `http://localhost:${config.port}`, description: 'Local Development Server' }] : [])
        : (config.apiUrl !== `http://localhost:${config.port}` ? [{ url: config.apiUrl, description: 'Production Server' }] : [])
      ),
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // We'll point swagger-jsdoc to scan our routes directory.
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

const swaggerSpec = swaggerJSDoc(options);

export const setupSwagger = (app: Application) => {
  // Mount the Swagger UI on /api-docs route
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "Femcart API Docs"
  }));
  console.log(`Swagger docs are available at ${config.apiUrl}/api-docs`);
};
