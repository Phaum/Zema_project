import React, { useEffect, useMemo, useState } from 'react';
import { Form, message } from 'antd';
import dayjs from 'dayjs';
import api from '../../components/projects/api';
import QuestionnairePanel from '../QuestionnairePanel';
import { FIXED_VALUATION_DATE, defaultQuestionnaire } from '../../utils/questionnaireDefaults';
import { buildQuestionnaireFormValues, normalizeObjectTypeValue } from '../../utils/projectQuestionnaire';

export default function ProjectQuestionnairePanel({
    projectId,
    project,
    onSaved,
    onChanged,
    onTransitionChange,
    readOnly = false,
    initialQuestionnaire = null,
}) {
    const [form] = Form.useForm();
    const [questionnaireLoading, setQuestionnaireLoading] = useState(true);
    const [questionnaireSaving, setQuestionnaireSaving] = useState(false);
    const watchedValues = Form.useWatch([], form) || {};

    useEffect(() => {
        async function loadQuestionnaire() {
            try {
                setQuestionnaireLoading(true);

                const data = initialQuestionnaire || (await api.get(`/projects/${projectId}/questionnaire`)).data;

                form.setFieldsValue({
                    ...defaultQuestionnaire,
                    ...buildQuestionnaireFormValues(data, project),
                    valuationDate: dayjs(FIXED_VALUATION_DATE),
                });
            } catch (error) {
                form.setFieldsValue({
                    ...defaultQuestionnaire,
                    projectName: project?.name || '',
                    valuationDate: dayjs(FIXED_VALUATION_DATE),
                });
            } finally {
                setQuestionnaireLoading(false);
            }
        }

        loadQuestionnaire();
    }, [projectId, form, project, project?.name, initialQuestionnaire]);

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
            if (readOnly) {
                return true;
            }

            const values = form.getFieldsValue(true);
            setQuestionnaireSaving(true);
            onTransitionChange?.(true);

            const response = await api.post(`/projects/${projectId}/questionnaire`, {
                ...values,
                valuationDate: FIXED_VALUATION_DATE,
            });

            message.success('Анкета проекта сохранена');

            const autoFilledFields = response?.data?.enrichment?.autoFilledFields || [];
            if (autoFilledFields.length > 0) {
                message.info(`Автоматически дополнено полей: ${autoFilledFields.length}`);
            }

            await onSaved?.();
            return true;
        } catch (error) {
            if (!error?.errorFields) {
                message.error(error?.response?.data?.error || 'Не удалось сохранить анкету');
            }
            return false;
        } finally {
            setQuestionnaireSaving(false);
            onTransitionChange?.(false);
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
                    valuationDate: dayjs(FIXED_VALUATION_DATE),
                })
            }
            saveQuestionnaire={saveQuestionnaire}
            onGoNext={onSaved}
            onQuestionnaireEnriched={(questionnaire) => onChanged?.(questionnaire)}
            readOnly={readOnly}
        />
    );
}
