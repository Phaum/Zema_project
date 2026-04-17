import axios from 'axios';
import { authStorage } from './authStorage';
import {
    logClientError,
    logClientRequest,
    logClientResponse,
} from './debugTransport';

export const API_PREFIX = process.env.REACT_APP_API_PREFIX || '/api';

function resolveBaseUrl(scope = '') {
    const normalizedScope = String(scope || '').trim();

    if (!normalizedScope) {
        return API_PREFIX;
    }

    return `${API_PREFIX}${normalizedScope.startsWith('/') ? normalizedScope : `/${normalizedScope}`}`;
}

function shouldSkipForcedLogout(requestUrl = '') {
    return requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');
}

function handleUnauthorized(error) {
    const status = error?.response?.status;
    const requestUrl = error?.config?.url || '';

    if (status !== 401 || shouldSkipForcedLogout(requestUrl)) {
        return;
    }

    authStorage.clear();

    if (window.location.pathname !== '/login') {
        window.dispatchEvent(new CustomEvent('auth:logout'));
    }
}

export function unwrapDataEnvelope(response) {
    if (
        response?.data &&
        typeof response.data === 'object' &&
        Object.prototype.hasOwnProperty.call(response.data, 'success') &&
        Object.prototype.hasOwnProperty.call(response.data, 'data')
    ) {
        return {
            ...response,
            data: response.data.data,
        };
    }

    return response;
}

export function createApiClient({
    scope = '',
    timeout = 15000,
    transportLabel = 'api',
    transformResponse,
} = {}) {
    const client = axios.create({
        baseURL: resolveBaseUrl(scope),
        timeout,
    });

    client.interceptors.request.use(
        (config) => {
            const token = authStorage.getToken();

            if (token) {
                config.headers = config.headers || {};
                config.headers.Authorization = `Bearer ${token}`;
            }

            logClientRequest(transportLabel, config);

            return config;
        },
        (error) => Promise.reject(error)
    );

    client.interceptors.response.use(
        (response) => {
            logClientResponse(transportLabel, response);
            return typeof transformResponse === 'function'
                ? transformResponse(response)
                : response;
        },
        (error) => {
            logClientError(transportLabel, error);
            handleUnauthorized(error);
            return Promise.reject(error);
        }
    );

    return client;
}

export const api = createApiClient();
