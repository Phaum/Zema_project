import React, { useMemo } from 'react';
import { Alert, Descriptions, Modal, Spin, Tag, Typography } from 'antd';
import ProjectQuestionnairePanel from '../projects/ProjectQuestionnairePanel';
import ProjectValidationPanel from '../projects/ProjectValidationPanel';
import ProjectResultDetailedPanel from '../projects/ProjectResultDetailedPanel';
import '../projects/projects.css';
import '../../pages/projects/ProjectWorkspace.css';

const { Text } = Typography;

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

function AdminProjectPreviewContent({ project }) {
    const stage = useMemo(() => resolveProjectPreviewStage(project), [project]);

    if (!project) {
        return null;
    }

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
                <Descriptions.Item label="Стадия просмотра">
                    {formatStageLabel(stage)}
                </Descriptions.Item>
                <Descriptions.Item label="Пользователь">
                    {project.user?.email || project.user_id || '—'}
                </Descriptions.Item>
            </Descriptions>

            {stage === 'questionnaire' && (
                project.questionnaire ? (
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
                        description="Проект находится на стадии анкеты, но сохраненных данных опросного листа пока нет."
                    />
                )
            )}

            {stage === 'validation' && (
                project.questionnaire ? (
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
                )
            )}

            {stage === 'result' && (
                project.result ? (
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
                        description="Проект находится на финальной стадии или в архиве, но запись результата отсутствует."
                    />
                )
            )}
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
