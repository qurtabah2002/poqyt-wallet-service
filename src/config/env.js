import dotenv from 'dotenv'; // Load environment variables from .env file

dotenv.config(); // Load .env file contents into process.env

export const env = { // Export an object containing environment variables
  port: process.env.PORT || 3000, // Default to 3000 if PORT is not set
  nodeEnv: process.env.NODE_ENV || 'development', // Default to 'development' if NODE_ENV is not set
  serviceName: process.env.SERVICE_NAME || 'core-service' // Default to 'core-service' if SERVICE_NAME is not set
};
