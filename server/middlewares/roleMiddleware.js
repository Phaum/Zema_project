import { User, Role } from '../models/index.js';

export const checkRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      // EXTRACT ID FROM req.user (authMiddleware PUT IT THERE)
      const userId = req.user.id;

      // SEARCH THE USER AND HIS ROLES IN DB
      const user = await User.findByPk(userId, {
        include: [{
          model: Role,
          attributes: ['role'],
          through: { attributes: [] }
        }]
      });

      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      // EXCTRACT USER ROLES AND ADDING IT IN STRING ARRAY
      // RESULT WOULD LOOK LIKE ['USER', 'ADMIN_ANALYST']
      const userRoles = user.Roles.map(r => r.role);

      // CHECKING IF USER HAVE AT LEAST 1 ALLOWED ROLE
      const hasAccess = allowedRoles.some(role => userRoles.includes(role));

      if (!hasAccess) {
        return res.status(403).json({ error: 'Доступ запрещен: недостаточно прав' });
      }

      // IF THERE IS NO PROBLEM, GOING TO CONTROLLER
      next();
    } catch (error) {
      res.status(500).json({ error: 'Ошибка при проверке прав доступа' });
    }
  };
};