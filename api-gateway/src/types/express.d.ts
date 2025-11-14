import { Request, Response } from 'express';

export interface AuthenticatedUser {
  userId: number;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
