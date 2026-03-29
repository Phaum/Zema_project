import axios from 'axios';
import { authStorage } from './authStorage';
import {
    logClientError,
    logClientRequest,
    logClientResponse,
} from './debugTransport';

const API_PREFIX = process.env.REACT_APP_API_PREFIX || '/api';

export const api = axios.create({
    baseURL: API_PREFIX,
    timeout: 15000,
});

api.interceptors.request.use(
    (config) => {
        const token = authStorage.getToken();

        if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
        }

        logClientRequest('api', config);

        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => {
        logClientResponse('api', response);
        return response;
    },
    (error) => {
        logClientError('api', error);
        const status = error?.response?.status;
        const requestUrl = error?.config?.url || '';

        const isAuthRequest =
            requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

        if (status === 401 && !isAuthRequest) {
            authStorage.clear();

            if (window.location.pathname !== '/login') {
                window.dispatchEvent(new CustomEvent('auth:logout'));
            }
        }

        return Promise.reject(error);
    }
);
