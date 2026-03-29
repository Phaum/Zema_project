import jwt from 'jsonwebtoken';
import { AUTH_CONFIG, ERROR_MESSAGES } from '../constants/auth.js';
import User from '../models/User.js';
import { attachDebugTransportLogging } from '../utils/debugTransportLogger.js';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: ERROR_MESSAGES.TOKEN_MISSING,
    });
  }

  // Extract token from "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== AUTH_CONFIG.BEARER_SCHEME) {
    return res.status(401).json({
      success: false,
      error: ERROR_MESSAGES.TOKEN_MISSING,
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const dbUser = await User.findByPk(decoded.id, {
      attributes: ['id', 'email', 'debug_mode'],
    });

    req.user = {
      ...decoded,
      debug_mode: Boolean(dbUser?.debug_mode),
      email: dbUser?.email || decoded.email,
    };

    attachDebugTransportLogging(req, res);
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: ERROR_MESSAGES.TOKEN_INVALID,
    });
  }
};
