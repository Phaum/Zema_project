import { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';
import { api } from '../shared/api';

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
