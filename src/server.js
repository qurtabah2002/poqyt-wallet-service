import app from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.log(`🚀 ${env.serviceName} running on port ${env.port}`);
});
