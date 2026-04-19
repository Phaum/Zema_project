function redactKey(key, value) {
    const normalizedKey = String(key || '').toLowerCase();

    if (
        normalizedKey.includes('password') ||
        normalizedKey.includes('token') ||
        normalizedKey.includes('authorization') ||
        normalizedKey.includes('password_hash')
    ) {
        return '[REDACTED]';
    }

    return value;
}

function sanitizeValue(value, depth = 0) {
    if (depth > 4) {
        return '[MAX_DEPTH]';
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (Buffer.isBuffer(value)) {
        return `[Buffer length=${value.length}]`;
    }

    if (Array.isArray(value)) {
        return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
    }

    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).slice(0, 100).map(([key, nestedValue]) => ([
                key,
                sanitizeValue(redactKey(key, nestedValue), depth + 1),
            ]))
        );
    }

    if (typeof value === 'string') {
        return value.length > 3000 ? `${value.slice(0, 3000)}...[TRUNCATED]` : value;
    }

    return value;
}

function buildRequestPayload(req) {
    return {
        method: req.method,
        url: req.originalUrl,
        params: sanitizeValue(req.params),
        query: sanitizeValue(req.query),
        body: sanitizeValue(req.body),
    };
}

function buildResponsePayload(statusCode, payload, startedAtMs) {
    return {
        statusCode,
        durationMs: Date.now() - startedAtMs,
        body: sanitizeValue(payload),
    };
}

function formatLogTime(date = new Date()) {
    return date.toISOString();
}

export function attachDebugTransportLogging(req, res) {
    if (!req?.user?.debug_mode) {
        return;
    }

    const startedAtMs = Date.now();
    const label = `[DEBUG USER ${req.user.id}${req.user.email ? ` ${req.user.email}` : ''}]`;
    console.log(`${formatLogTime()} ${label} REQUEST ${JSON.stringify(buildRequestPayload(req))}`);

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let responseLogged = false;

    const logResponseOnce = (payload) => {
        if (responseLogged) return;
        responseLogged = true;
        console.log(`${formatLogTime()} ${label} RESPONSE ${JSON.stringify(buildResponsePayload(res.statusCode, payload, startedAtMs))}`);
    };

    res.json = (payload) => {
        logResponseOnce(payload);
        return originalJson(payload);
    };

    res.send = (payload) => {
        logResponseOnce(payload);
        return originalSend(payload);
    };
}
