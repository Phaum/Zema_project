import { User, Role } from '../models/index.js';
import { normalizeUserSettings } from '../constants/userSettings.js';

export async function getUserWithRoles(userId, transaction = null) {
  const options = {
    attributes: ['id', 'first_name', 'last_name', 'email', 'status', 'debug_mode', 'created_at', 'settings_json'],
    include: [
      {
        model: Role,
        attributes: ['role', 'name'],
        through: { attributes: [] },
      },
    ],
  };

  if (transaction) {
    options.transaction = transaction;
  }

  return User.findByPk(userId, options);
}

export function extractRoles(user) {
  if (!user) return [];
  return Array.isArray(user.Roles)
    ? user.Roles.map(item => item.role).filter(Boolean)
    : [];
}

export function hasRole(user, role) {
  const roles = extractRoles(user);
  return roles.includes(role);
}

export function formatUserResponse(user) {
  const roles = extractRoles(user);

  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    status: user.status,
    debug_mode: Boolean(user.debug_mode),
    created_at: user.created_at,
    roles,
    settings: normalizeUserSettings(user.settings_json),
  };
}

export async function getUserByEmail(email, transaction = null) {
  const options = {
    where: { email },
  };

  if (transaction) {
    options.transaction = transaction;
  }

  return User.findOne(options);
}

export async function getDefaultUserRole(transaction = null) {
  const options = {
    where: { role: 'USER' },
  };

  if (transaction) {
    options.transaction = transaction;
  }

  return Role.findOne(options);
}
