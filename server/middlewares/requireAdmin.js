import { User, Role } from '../models/index.js';
import { getUserWithRoles, hasRole } from '../utils/userHelpers.js';
import { ROLES, ERROR_MESSAGES } from '../constants/auth.js';

export default async function requireAdmin(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.TOKEN_MISSING,
      });
    }

    const user = await getUserWithRoles(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    const isAdmin = hasRole(user, ROLES.ADMIN_ANALYST);

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: ERROR_MESSAGES.ACCESS_DENIED,
      });
    }

    req.userEntity = user;
    next();
  } catch (error) {
    console.error('requireAdmin error:', error);
    return res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.SERVER_ERROR,
    });
  }
}