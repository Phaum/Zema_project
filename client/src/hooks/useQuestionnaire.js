import { useCallback, useEffect, useMemo, useState } from 'react';
import { Form, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { defaultQuestionnaire } from '../utils/questionnaireDefaults';
import { normalizeObjectTypeValue } from '../utils/projectQuestionnaire';

const API = process.env.REACT_APP_API_PREFIX || '/api';
const QUESTIONNAIRE_STORAGE_KEY = 'zema_questionnaire_draft';

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

function normalizeFromServer(data = {}) {
    return {
        ...defaultQuestionnaire,
        ...data,
        valuationDate: data.valuationDate ? dayjs(data.valuationDate) : null,
    };
}

function prepareForServer(values = {}) {
    return {
        ...values,
        valuationDate: values.valuationDate
            ? dayjs(values.valuationDate).format('YYYY-MM-DD')
            : null,
    };
}

function prepareForStorage(values = {}) {
    return {
        ...values,
        valuationDate: values.valuationDate
            ? dayjs(values.valuationDate).format('YYYY-MM-DD')
            : null,
    };
}

export function useQuestionnaire() {
    const [form] = Form.useForm();

    const [questionnaireLoading, setQuestionnaireLoading] = useState(true);
    const [questionnaireSaving, setQuestionnaireSaving] = useState(false);

    const watchedValues = Form.useWatch([], form) || {};

    const persistDraftLocally = useCallback((values) => {
        try {
            localStorage.setItem(
                QUESTIONNAIRE_STORAGE_KEY,
                JSON.stringify(prepareForStorage(values))
            );
        } catch (error) {
            console.error('Не удалось сохранить черновик', error);
        }
    }, []);

    const restoreLocalDraft = useCallback(() => {
        try {
            const raw = localStorage.getItem(QUESTIONNAIRE_STORAGE_KEY);
            if (!raw) return null;
            return normalizeFromServer(JSON.parse(raw));
        } catch (error) {
            console.error('Не удалось восстановить черновик', error);
            return null;
        }
    }, []);

    const loadQuestionnaire = useCallback(async () => {
        setQuestionnaireLoading(true);
        try {
            const { data } = await api.get('/profile/questionnaire');

            if (data) {
                form.setFieldsValue(normalizeFromServer(data));
            } else {
                form.setFieldsValue(restoreLocalDraft() || defaultQuestionnaire);
            }
        } catch (error) {
            console.error('Не удалось загрузить анкету', error);
            form.setFieldsValue(restoreLocalDraft() || defaultQuestionnaire);
        } finally {
            setQuestionnaireLoading(false);
        }
    }, [form, restoreLocalDraft]);

    useEffect(() => {
        loadQuestionnaire();
    }, [loadQuestionnaire]);

    const saveQuestionnaire = useCallback(async () => {
        try {
            const values = await form.validateFields();
            setQuestionnaireSaving(true);

            persistDraftLocally(values);
            await api.post('/profile/questionnaire', prepareForServer(values));

            message.success('Анкета сохранена');
            return true;
        } catch (error) {
            if (error?.errorFields) {
                message.error('Проверьте обязательные поля анкеты');
            } else {
                console.error('Не удалось сохранить анкету', error);
                message.error(error?.response?.data?.error || 'Не удалось сохранить анкету');
            }
            return false;
        } finally {
            setQuestionnaireSaving(false);
        }
    }, [form, persistDraftLocally]);

    const clearQuestionnaire = useCallback(() => {
        form.setFieldsValue(defaultQuestionnaire);
        localStorage.removeItem(QUESTIONNAIRE_STORAGE_KEY);
        message.success('Черновик очищен');
    }, [form]);

    const questionnaireStatus = useMemo(() => {
        const requiredKeys = [
            'calculationMethod',
            'projectName',
            'buildingCadastralNumber',
            'valuationDate',
            'objectType',
            'businessCenterClass',
            'objectAddress',
            'totalArea',
            'constructionYear',
            'aboveGroundFloors',
            'hasBasementFloor',
            'undergroundFloors',
            'landCadastralNumber',
            'landArea',
            'hasPrepayment',
            'hasSecurityDeposit',
        ];
        const isBuildingObject = normalizeObjectTypeValue(watchedValues?.objectType) === 'здание';

        if (isBuildingObject) {
            requiredKeys.splice(5, 0, 'actualUse');
        }

        const filled = requiredKeys.reduce((acc, key) => {
            const value = watchedValues[key];
            return value !== undefined && value !== null && value !== '' ? acc + 1 : acc;
        }, 0);

        return {
            filled,
            total: requiredKeys.length,
        };
    }, [watchedValues]);

    const isQuestionnaireStarted = useMemo(() => {
        return Boolean(
            watchedValues?.projectName ||
            watchedValues?.buildingCadastralNumber ||
            watchedValues?.landCadastralNumber
        );
    }, [watchedValues]);

    const isQuestionnaireReady = useMemo(() => {
        return Boolean(
            watchedValues?.projectName &&
            watchedValues?.buildingCadastralNumber &&
            watchedValues?.valuationDate &&
            watchedValues?.objectAddress &&
            watchedValues?.landCadastralNumber
        );
    }, [watchedValues]);

    return {
        form,
        questionnaireLoading,
        questionnaireSaving,
        questionnaireStatus,
        isQuestionnaireStarted,
        isQuestionnaireReady,
        persistDraftLocally,
        saveQuestionnaire,
        clearQuestionnaire,
        reloadQuestionnaire: loadQuestionnaire,
    };
}
