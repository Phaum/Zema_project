import { ERROR_MESSAGES, AUTH_CONFIG } from '../constants/auth.js';

export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: ERROR_MESSAGES.EMAIL_PASSWORD_REQUIRED };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_EMAIL_FORMAT };
  }

  return { valid: true };
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: ERROR_MESSAGES.EMAIL_PASSWORD_REQUIRED };
  }

  if (password.length < AUTH_CONFIG.PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      error: `Пароль должен быть минимум ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} символов`
    };
  }

  return { valid: true };
}

export function toNumber(value, fallback = null, options = {}) {
  const { normalizeDot = true } = options;

  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'не указано'
  ) {
    return fallback;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  let normalized = String(value).trim();
  if (normalizeDot) {
    normalized = normalized.replace(/\s+/g, '').replace(',', '.');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

export function safeString(value) {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'не указано'
  ) {
    return null;
  }

  return String(value);
}

export function validateCredentials(email, password) {
  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    return emailValidation;
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return passwordValidation;
  }

  return { valid: true };
}
