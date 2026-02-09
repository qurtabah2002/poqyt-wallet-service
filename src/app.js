import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import healthRoutes from './routes/health.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import walletRoutes from './routes/wallet.routes.js';

import eventsRoutes from './routes/events.routes.js';



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
app.use('/wallets', walletRoutes);
app.use('/events', eventsRoutes);

// Global error handler
app.use(errorHandler);

export default app;
