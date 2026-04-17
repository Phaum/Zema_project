import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { api } from '../shared/api';
import { authStorage } from '../shared/authStorage';
import { normalizeUserSettings } from '../shared/userSettings';

const AuthContext = createContext(null);

function normalizeUser(payload) {
    if (!payload) return null;

    const raw = payload.user || payload.profile || payload.data || payload;

    return {
        id: raw.id ?? raw.user_id ?? null,
        email: raw.email ?? '',
        first_name: raw.first_name ?? raw.firstName ?? '',
        last_name: raw.last_name ?? raw.lastName ?? '',
        debugMode: Boolean(raw.debugMode ?? raw.debug_mode),
        roles: Array.isArray(raw.roles) ? raw.roles : [],
        status: raw.status ?? '',
        created_at: raw.created_at ?? null,
        settings: normalizeUserSettings(raw.settings),
    };
}

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(authStorage.getToken());
    const [user, setUser] = useState(authStorage.getUser());
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const clearAuth = useCallback(() => {
        authStorage.clear();
        setToken('');
        setUser(null);
    }, []);

    const setAuthData = useCallback((nextToken, nextUser) => {
        authStorage.setToken(nextToken || '');
        setToken(nextToken || '');

        if (nextUser) {
            const normalized = normalizeUser(nextUser);
            authStorage.setUser(normalized);
            setUser(normalized);
            return normalized;
        }

        authStorage.setUser(null);
        setUser(null);
        return null;
    }, []);

    const refreshProfile = useCallback(async () => {
        const currentToken = authStorage.getToken();
        if (!currentToken) return null;

        const { data } = await api.get('/profile');
        const normalized = normalizeUser(data);
        authStorage.setUser(normalized);
        setUser(normalized);
        return normalized;
    }, []);

    const updateSettings = useCallback(async (settingsPatch) => {
        const { data } = await api.put('/profile/settings', {
            settings: settingsPatch,
        });

        const normalized = normalizeUser(data);
        authStorage.setUser(normalized);
        setUser(normalized);
        return normalized;
    }, []);

    const updateEmail = useCallback(
        async ({ newEmail, confirmEmail, currentPassword }) => {
            const { data } = await api.put('/profile/email', {
                newEmail,
                confirmEmail,
                currentPassword,
            });

            const nextToken = data?.token || authStorage.getToken();
            const normalized = normalizeUser(data);
            setAuthData(nextToken, normalized);
            return normalized;
        },
        [setAuthData]
    );

    const login = useCallback(
        async ({ email, password }) => {
            const { data } = await api.post('/auth/login', { email, password });

            const nextToken = data?.token;
            if (!nextToken) {
                throw new Error('Сервер не вернул токен');
            }

            setAuthData(nextToken, data?.user || data?.profile || null);

            if (!data?.user && !data?.profile) {
                await refreshProfile();
            }

            return data;
        },
        [refreshProfile, setAuthData]
    );

    const register = useCallback(async ({ firstName, lastName, email, password }) => {
        const { data } = await api.post('/auth/register', {
            firstName,
            lastName,
            email,
            password,
        });

        return data;
    }, []);

    const logout = useCallback(() => {
        clearAuth();
    }, [clearAuth]);

    useEffect(() => {
        let ignore = false;

        async function bootstrap() {
            const currentToken = authStorage.getToken();

            if (!currentToken) {
                if (!ignore) setIsReady(true);
                return;
            }

            setIsLoading(true);

            try {
                const { data } = await api.get('/profile');
                if (ignore) return;

                const normalized = normalizeUser(data);
                authStorage.setUser(normalized);
                setToken(currentToken);
                setUser(normalized);
            } catch (error) {
                if (!ignore) {
                    clearAuth();
                }
            } finally {
                if (!ignore) {
                    setIsLoading(false);
                    setIsReady(true);
                }
            }
        }

        bootstrap();

        return () => {
            ignore = true;
        };
    }, [clearAuth]);

    useEffect(() => {
        const handleForcedLogout = () => {
            clearAuth();
        };

        window.addEventListener('auth:logout', handleForcedLogout);

        return () => {
            window.removeEventListener('auth:logout', handleForcedLogout);
        };
    }, [clearAuth]);

    useEffect(() => {
        document.body.classList.toggle(
            'compact-ui',
            Boolean(user?.settings?.compactMode)
        );

        return () => {
            document.body.classList.remove('compact-ui');
        };
    }, [user?.settings?.compactMode]);

    const value = useMemo(
        () => ({
            token,
            user,
            settings: normalizeUserSettings(user?.settings),
            isReady,
            isLoading,
            isAuthenticated: Boolean(token && user),
            login,
            register,
            logout,
            refreshProfile,
            updateSettings,
            updateEmail,
            clearAuth,
        }),
        [token, user, isReady, isLoading, login, register, logout, refreshProfile, updateSettings, updateEmail, clearAuth]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth должен использоваться внутри AuthProvider');
    }

    return context;
};
