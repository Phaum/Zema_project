import React, { useEffect, useMemo, useState } from 'react';
import { Form, message } from 'antd';
import dayjs from 'dayjs';
import api from '../../components/projects/api';
import QuestionnairePanel from '../QuestionnairePanel';
import { defaultQuestionnaire } from '../../utils/questionnaireDefaults';
import { buildQuestionnaireFormValues, normalizeObjectTypeValue } from '../../utils/projectQuestionnaire';

export default function ProjectQuestionnairePanel({ projectId, project, onSaved }) {
    const [form] = Form.useForm();
    const [questionnaireLoading, setQuestionnaireLoading] = useState(true);
    const [questionnaireSaving, setQuestionnaireSaving] = useState(false);
    const watchedValues = Form.useWatch([], form) || {};

    useEffect(() => {
        async function loadQuestionnaire() {
            try {
                setQuestionnaireLoading(true);

                const { data } = await api.get(`/projects/${projectId}/questionnaire`);

                form.setFieldsValue({
                    ...defaultQuestionnaire,
                    ...buildQuestionnaireFormValues(data, project),
                    valuationDate: data?.valuationDate ? dayjs(data.valuationDate) : null,
                });
            } catch (error) {
                form.setFieldsValue({
                    ...defaultQuestionnaire,
                    projectName: project?.name || '',
                });
            } finally {
                setQuestionnaireLoading(false);
            }
        }

        loadQuestionnaire();
    }, [projectId, form, project?.name]);

    const questionnaireStatus = useMemo(() => {
        const values = {
            ...form.getFieldsValue(true),
            ...watchedValues,
        };
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
        ];
        const isBuildingObject = normalizeObjectTypeValue(values.objectType) === 'здание';

        if (isBuildingObject) {
            requiredKeys.splice(5, 0, 'actualUse');
        }

        const filled = requiredKeys.reduce((acc, key) => {
            const value = values[key];
            return value !== undefined && value !== null && value !== '' ? acc + 1 : acc;
        }, 0);

        return { filled, total: requiredKeys.length };
    }, [form, watchedValues]);

    const saveQuestionnaire = async () => {
        try {
            await form.validateFields();
            const values = form.getFieldsValue(true);
            setQuestionnaireSaving(true);

            const response = await api.post(`/projects/${projectId}/questionnaire`, {
                ...values,
                valuationDate: values.valuationDate
                    ? dayjs(values.valuationDate).format('YYYY-MM-DD')
                    : null,
            });

            message.success('Анкета проекта сохранена');

            const autoFilledFields = response?.data?.enrichment?.autoFilledFields || [];
            if (autoFilledFields.length > 0) {
                message.info(`Автоматически дополнено полей: ${autoFilledFields.length}`);
            }

            onSaved?.();
            return true;
        } catch (error) {
            if (!error?.errorFields) {
                message.error(error?.response?.data?.error || 'Не удалось сохранить анкету');
            }
            return false;
        } finally {
            setQuestionnaireSaving(false);
        }
    };

    return (
        <QuestionnairePanel
            projectId={projectId}
            form={form}
            questionnaireLoading={questionnaireLoading}
            questionnaireSaving={questionnaireSaving}
            questionnaireStatus={questionnaireStatus}
            persistDraftLocally={() => {}}
            clearQuestionnaire={() =>
                form.setFieldsValue({
                    ...defaultQuestionnaire,
                    projectName: project?.name || '',
                })
            }
            saveQuestionnaire={saveQuestionnaire}
            onGoNext={onSaved}
        />
    );
}
