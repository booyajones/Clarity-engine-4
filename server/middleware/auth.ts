import { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const userIdHeader = req.header('x-user-id');
  if (!userIdHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const id = parseInt(userIdHeader, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  req.user = { id };
  next();
}
