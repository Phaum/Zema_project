import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serverRootDir = path.resolve(currentDir, '..');

dotenv.config({ path: path.join(serverRootDir, '.env') });

function readRequiredEnv(name, { trim = true } = {}) {
    const rawValue = process.env[name];
    const normalizedValue = trim && typeof rawValue === 'string'
        ? rawValue.trim()
        : rawValue;

    if (!normalizedValue) {
        throw new Error(`Отсутствует обязательная переменная окружения ${name}. Проверьте server/.env`);
    }

    return normalizedValue;
}

function readOptionalNumber(name, fallbackValue) {
    const rawValue = process.env[name];

    if (!rawValue || !String(rawValue).trim()) {
        return fallbackValue;
    }

    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
        throw new Error(`Переменная окружения ${name} должна быть числом. Проверьте server/.env`);
    }

    return numericValue;
}

export const env = Object.freeze({
    PORT: readOptionalNumber('PORT', 5000),
    CLIENT_URL: readRequiredEnv('CLIENT_URL'),
    JWT_SECRET: readRequiredEnv('JWT_SECRET', { trim: false }),
    DB_HOST: readRequiredEnv('DB_HOST'),
    DB_PORT: readOptionalNumber('DB_PORT', 5432),
    DB_NAME: readRequiredEnv('DB_NAME'),
    DB_USER: readRequiredEnv('DB_USER'),
    DB_PASSWORD: readRequiredEnv('DB_PASSWORD', { trim: false }),
    DB_LOGGING: process.env.DB_LOGGING === 'true',
});
