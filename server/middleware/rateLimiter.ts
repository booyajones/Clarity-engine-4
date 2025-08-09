import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// General API rate limiter - increased for testing
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 10000 requests per windowMs - increased for testing
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Skip rate limiting for health checks and classify endpoint
    return req.path.startsWith('/api/health') || req.path === '/api/classify';
  }
});

// Strict rate limiter for upload endpoints
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 uploads per windowMs
  message: 'Too many upload requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

// Moderate rate limiter for classification endpoints - increased for testing
export const classificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10000, // limit each IP to 10000 classification requests per minute - increased for testing
  message: 'Too many classification requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limiter for expensive operations
export const expensiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 expensive operations per hour
  message: 'Too many expensive operations requested. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false
});

// Authentication rate limiter
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: 'Too many login attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});