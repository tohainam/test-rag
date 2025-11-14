/**
 * Authenticated Request Interface
 * Extends Express Request with user context from API Gateway
 *
 * Architecture: Gateway-Based Authentication Pattern
 * - API Gateway handles JWT authentication via Auth service TCP
 * - Gateway injects user context in headers:
 *   - X-User-Id: User's database ID
 *   - X-User-Email: User's email
 *   - X-User-Role: User's role (SUPER_ADMIN, ADMIN, USER)
 *   - X-Gateway-Auth: Verification flag (must be "verified")
 * - Backend services verify requests come from gateway (trust boundary)
 */

import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    email: string;
    role: string;
  };
}
