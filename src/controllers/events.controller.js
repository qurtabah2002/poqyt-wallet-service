import { processEvent } from '../services/eventProcessor.js';

export const handleEvent = async (req, res, next) => {
  try {
    const result = await processEvent(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
