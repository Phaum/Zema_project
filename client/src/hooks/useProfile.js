import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { message } from 'antd';

const API = process.env.REACT_APP_API_PREFIX || '/api';

const api = axios.create({
    baseURL: API,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export function useProfile() {
    const [profile, setProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);

    const loadProfile = useCallback(async () => {
        setProfileLoading(true);
        try {
            const { data } = await api.get('/profile');
            setProfile(data);
        } catch (error) {
            console.error('Не удалось загрузить профиль', error);
            message.error(error?.response?.data?.error || 'Не удалось загрузить профиль');
        } finally {
            setProfileLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    return {
        profile,
        profileLoading,
        reloadProfile: loadProfile,
    };
}