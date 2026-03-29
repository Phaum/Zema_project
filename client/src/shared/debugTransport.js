import { authStorage } from './authStorage';

function isDebugEnabled() {
    return Boolean(authStorage.getUser()?.debugMode);
}

function sanitizePayload(value, depth = 0) {
    if (depth > 4) return '[MAX_DEPTH]';
    if (value === null || value === undefined) return value;

    if (Array.isArray(value)) {
        return value.slice(0, 50).map((item) => sanitizePayload(item, depth + 1));
    }

    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).slice(0, 100).map(([key, nestedValue]) => {
                const normalizedKey = String(key || '').toLowerCase();
                const safeValue = (
                    normalizedKey.includes('password') ||
                    normalizedKey.includes('token') ||
                    normalizedKey.includes('authorization')
                )
                    ? '[REDACTED]'
                    : sanitizePayload(nestedValue, depth + 1);

                return [key, safeValue];
            })
        );
    }

    if (typeof value === 'string') {
        return value.length > 2000 ? `${value.slice(0, 2000)}...[TRUNCATED]` : value;
    }

    return value;
}

export function logClientRequest(namespace, config) {
    if (!isDebugEnabled()) return;

    console.log(`[DEBUG CLIENT ${namespace}] REQUEST`, {
        method: config?.method,
        url: config?.url,
        params: sanitizePayload(config?.params),
        data: sanitizePayload(config?.data),
    });
}

export function logClientResponse(namespace, response) {
    if (!isDebugEnabled()) return;

    console.log(`[DEBUG CLIENT ${namespace}] RESPONSE`, {
        status: response?.status,
        url: response?.config?.url,
        data: sanitizePayload(response?.data),
    });
}

export function logClientError(namespace, error) {
    if (!isDebugEnabled()) return;

    console.log(`[DEBUG CLIENT ${namespace}] ERROR`, {
        status: error?.response?.status,
        url: error?.config?.url,
        data: sanitizePayload(error?.response?.data),
    });
}
