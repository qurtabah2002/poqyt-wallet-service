import { healthService } from '../services/health.service.js';

export const healthCheck = (req, res) => {
  const status = healthService.getStatus();
  res.status(200).json(status);
};
