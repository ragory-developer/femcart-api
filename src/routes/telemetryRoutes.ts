import { Router } from 'express';
import logger from '../utils/logger';

const router = Router();

router.post('/logs', (req, res) => {
  const { logs, level, message, metadata } = req.body;
  
  // Log frontend telemetry data using the backend logger
  logger.info('Frontend Telemetry:', { level, message, metadata, logs });
  
  res.json({ success: true, message: 'Logs processed successfully' });
});

export default router;
