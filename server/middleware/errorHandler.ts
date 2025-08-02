import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Custom error class for application errors
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  
  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Database error handler
export function handleDatabaseError(error: any): AppError {
  console.error('Database error:', error);
  
  // Handle specific PostgreSQL error codes
  if (error.code === '57P01') {
    return new AppError('Database connection was terminated. Please try again.', 503);
  }
  
  if (error.code === '08P01') {
    return new AppError('Database protocol error. Please try again.', 503);
  }
  
  if (error.code === '08006') {
    return new AppError('Database connection failed. Please try again.', 503);
  }
  
  if (error.code === '23505') {
    return new AppError('Duplicate entry found.', 409);
  }
  
  if (error.code === '23503') {
    return new AppError('Referenced data not found.', 400);
  }
  
  // Generic database error
  return new AppError('Database operation failed. Please try again.', 500);
}

// Async error wrapper
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Global error handler middleware
export function errorHandler(
  err: Error | AppError | z.ZodError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Default error values
  let statusCode = 500;
  let message = 'Internal server error';
  let details: any = undefined;
  
  // Handle different error types
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof z.ZodError) {
    statusCode = 400;
    message = 'Validation error';
    details = err.errors;
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    if ((err as any).code === 'LIMIT_FILE_SIZE') {
      message = 'File too large. Maximum size is 50MB.';
    } else {
      message = 'File upload error';
    }
  } else if (err.message.includes('Database')) {
    const dbError = handleDatabaseError(err);
    statusCode = dbError.statusCode;
    message = dbError.message;
  }
  
  // Log error details
  console.error('Error handler caught:', {
    statusCode,
    message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Send error response
  res.status(statusCode).json({
    error: message,
    ...(details && { details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

// Not found handler
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'Resource not found',
    path: req.path
  });
}