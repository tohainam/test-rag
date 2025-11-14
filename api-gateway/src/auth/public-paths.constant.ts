/**
 * Public routes that don't require authentication
 * This constant is shared between main.ts middleware and AuthMiddleware
 * to ensure consistent authentication behavior across the application.
 */
export const PUBLIC_PATHS = [
  '/auth/google',
  '/auth/google/callback',
  '/auth/logout',
  '/auth/refresh',
  '/auth/session',
  '/queues', // BullMQ Dashboard
  '/mcp', // MCP Server endpoints (download, info - all public)
  '/evaluation/health', // RAGAS Evaluation health check
] as const;
