import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import healthRoutes from './routes/health.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();

// Security
app.use(helmet());

// CORS
app.use(cors());

// Body parsing
app.use(express.json());

// Logging
app.use(morgan('dev'));

// Routes
app.use('/health', healthRoutes);

// Global error handler
app.use(errorHandler);

export default app;
