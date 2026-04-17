const TOKEN_KEY = 'token';
const USER_KEY = 'zema_user';

export const authStorage = {
    getToken() {
        return localStorage.getItem(TOKEN_KEY) || '';
    },

    setToken(token) {
        if (!token) {
            localStorage.removeItem(TOKEN_KEY);
            return;
        }
        localStorage.setItem(TOKEN_KEY, token);
    },

    removeToken() {
        localStorage.removeItem(TOKEN_KEY);
    },

    getUser() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },

    setUser(user) {
        if (!user) {
            localStorage.removeItem(USER_KEY);
            return;
        }
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    },

    clear() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    },
};