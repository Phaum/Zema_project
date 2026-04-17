export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked',
};

export const ROLES = {
  ADMIN_ANALYST: 'ADMIN_ANALYST',
  USER: 'USER',
};

export const AUTH_CONFIG = {
  BEARER_SCHEME: 'Bearer',
  JWT_EXPIRY: '24h',
  BCRYPT_ROUNDS: 10,
  PASSWORD_MIN_LENGTH: 8,
};

export const ERROR_MESSAGES = {
  EMAIL_PASSWORD_REQUIRED: 'Email и пароль обязательны',
  EMAIL_ALREADY_EXISTS: 'Пользователь с таким email уже существует',
  INVALID_CREDENTIALS: 'Неверные учетные данные',
  ACCOUNT_BLOCKED: 'Аккаунт заблокирован',
  REGISTRATION_SUCCESS: 'Регистрация успешна',
  LOGIN_SUCCESS: 'Успешный вход',
  USER_NOT_FOUND: 'Пользователь не найден',
  PROFILE_LOAD_ERROR: 'Не удалось загрузить профиль',
  ACCESS_DENIED: 'Доступ запрещён',
  TOKEN_MISSING: 'Доступ запрещен. Токен не предоставлен.',
  TOKEN_INVALID: 'Неверный или просроченный токен.',
  INVALID_EMAIL_FORMAT: 'Неверный формат email',
  PASSWORD_TOO_SHORT: 'Пароль должен быть минимум 8 символов',
  SERVER_ERROR: 'Ошибка при выполнении операции',
};
