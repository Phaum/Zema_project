import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Descriptions, Modal, Spin, Tabs, Tag, Typography } from 'antd';
import ProjectQuestionnairePanel from '../projects/ProjectQuestionnairePanel';
import ProjectValidationPanel from '../projects/ProjectValidationPanel';
import ProjectResultDetailedPanel from '../projects/ProjectResultDetailedPanel';
import '../projects/projects.css';
import '../../pages/projects/ProjectWorkspace.css';

const { Text } = Typography;

const PROJECT_PREVIEW_STAGES = [
    { key: 'questionnaire', label: 'Опросный лист' },
    { key: 'validation', label: 'Проверка' },
    { key: 'result', label: 'Результат' },
];

function resolveProjectPreviewStage(project) {
    const status = String(project?.status || '').trim().toLowerCase();

    if (project?.result || status === 'completed') {
        return 'result';
    }

    if (status === 'validation' || status === 'calculation' || status === 'payment') {
        return 'validation';
    }

    return 'questionnaire';
}

function formatStageLabel(stage) {
    const labels = {
        questionnaire: 'Опросный лист',
        validation: 'Проверка',
        result: 'Результат',
    };

    return labels[stage] || stage;
}

function resolveCalculationDate(project) {
    return (
        project?.result?.calculated_at ||
        project?.result?.calculatedAt ||
        project?.result?.updated_at ||
        project?.result?.updatedAt ||
        project?.result?.created_at ||
        project?.result?.createdAt ||
        null
    );
}

function formatDateTime(value) {
    if (!value) {
        return '—';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return date.toLocaleString('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'Europe/Moscow',
    });
}

function AdminProjectPreviewContent({ project }) {
    const stage = useMemo(() => resolveProjectPreviewStage(project), [project]);
    const calculationDate = useMemo(() => resolveCalculationDate(project), [project]);
    const [activeStage, setActiveStage] = useState(stage);

    useEffect(() => {
        setActiveStage(stage);
    }, [project?.id, stage]);

    if (!project) {
        return null;
    }

    const renderStageContent = (stageKey) => {
        if (stageKey === 'questionnaire') {
            return project.questionnaire ? (
                <ProjectQuestionnairePanel
                    projectId={project.id}
                    project={project}
                    initialQuestionnaire={project.questionnaire}
                    readOnly
                />
            ) : (
                <Alert
                    type="info"
                    showIcon
                    message="Опросный лист еще не заполнен"
                    description="Для проекта пока нет сохраненных данных опросного листа."
                />
            );
        }

        if (stageKey === 'validation') {
            return project.questionnaire ? (
                <ProjectValidationPanel
                    projectId={project.id}
                    project={project}
                    readOnly
                />
            ) : (
                <Alert
                    type="info"
                    showIcon
                    message="Нет данных для проверки"
                    description="Для проекта еще не найден сохраненный опросный лист."
                />
            );
        }

        if (stageKey === 'result') {
            return project.result ? (
                <ProjectResultDetailedPanel
                    projectId={project.id}
                    project={project}
                    initialResult={project.result}
                    marketContext={project.result?.market_snapshot_json || null}
                    readOnly
                />
            ) : (
                <Alert
                    type="warning"
                    showIcon
                    message="Результат еще не рассчитан"
                    description="Запись результата появится после выполнения расчета проекта."
                />
            );
        }

        return null;
    };

    const tabItems = PROJECT_PREVIEW_STAGES.map((item) => ({
        key: item.key,
        label: item.label,
        children: renderStageContent(item.key),
    }));

    return (
        <div className="admin-project-preview">
            <Descriptions
                size="small"
                column={{ xs: 1, sm: 2, lg: 4 }}
                bordered
                style={{ marginBottom: 16 }}
            >
                <Descriptions.Item label="ID">{project.id}</Descriptions.Item>
                <Descriptions.Item label="Статус">
                    <Tag color="blue">{project.status || '—'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Стадия проекта">
                    {formatStageLabel(stage)}
                </Descriptions.Item>
                <Descriptions.Item label="Дата расчета">
                    {formatDateTime(calculationDate)}
                </Descriptions.Item>
                <Descriptions.Item label="Пользователь">
                    {project.user?.email || project.user_id || '—'}
                </Descriptions.Item>
            </Descriptions>

            <Tabs
                activeKey={activeStage}
                items={tabItems}
                onChange={setActiveStage}
            />
        </div>
    );
}

export default function AdminProjectPreviewModal({
    open,
    loading,
    project,
    error,
    onClose,
}) {
    return (
        <Modal
            open={open}
            title={(
                <div>
                    <div>Просмотр проекта</div>
                    <Text type="secondary">{project?.name || 'Загрузка проекта...'}</Text>
                </div>
            )}
            onCancel={onClose}
            footer={null}
            width={1240}
            destroyOnHidden
            styles={{
                body: {
                    maxHeight: 'calc(100vh - 170px)',
                    overflowY: 'auto',
                    paddingRight: 12,
                },
            }}
        >
            <Spin spinning={loading}>
                {error ? (
                    <Alert type="error" showIcon message={error} />
                ) : (
                    <AdminProjectPreviewContent project={project} />
                )}
            </Spin>
        </Modal>
    );
}
