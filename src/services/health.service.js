export const healthService = {
  getStatus() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString()
    };
  }
};
