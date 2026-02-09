import express from 'express';
import { handleEvent } from '../controllers/events.controller.js';

const router = express.Router();
router.post('/', handleEvent);

export default router;