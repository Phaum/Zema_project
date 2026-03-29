import React, { useCallback, useEffect, useState } from 'react';
import { Card, Empty, Space, Steps, message } from 'antd';
import api from '../../components/projects/api';
import ProjectQuestionnairePanel from '../../components/projects/ProjectQuestionnairePanel';
import ProjectValidationPanel from '../../components/projects/ProjectValidationPanel';
import ProjectPaymentPanel from '../../components/projects/ProjectPaymentPanel';
import ProjectResultDetailedPanel from '../../components/projects/ProjectResultDetailedPanel';
import './ProjectWorkspace.css';

function buildWorkspaceSteps(subscriptionActive) {
    const items = [
        { title: 'Опросный лист' },
        { title: 'Проверка' },
    ];

    if (!subscriptionActive) {
        items.push({ title: 'Оплата' });
    }

    items.push({ title: 'Результат' });
    return items;
}

function resolveProjectStep(project, subscriptionActive) {
    const resultStep = subscriptionActive ? 2 : 3;
    const status = project?.status;

    if (status === 'validation') {
        return 1;
    }

    if (status === 'completed' || status === 'archived') {
        return resultStep;
    }

    if (status === 'calculation') {
        return subscriptionActive ? resultStep : 2;
    }

    return 0;
}

export default function ProjectWorkspace({ projectId, onProjectChanged }) {
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeStep, setActiveStep] = useState(0);
    const [marketContext, setMarketContext] = useState(null);

    const loadProject = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/projects/${projectId}`);
            setProject(data);
            const nextStep = resolveProjectStep(data, Boolean(data?.access?.subscriptionActive));
            const nextResultStepIndex = Boolean(data?.access?.subscriptionActive) ? 2 : 3;
            setActiveStep(nextStep);

            if (nextStep >= nextResultStepIndex) {
                try {
                    const marketRes = await api.get(`/projects/${projectId}/market-context`);
                    setMarketContext(marketRes.data || null);
                } catch (error) {
                    console.error('Не удалось загрузить контекст аналогов:', error);
                    setMarketContext(null);
                }
            } else {
                setMarketContext(null);
            }
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось загрузить проект');
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        setProject(null);
        setMarketContext(null);
        setActiveStep(0);
        loadProject();
    }, [loadProject]);

    const isProjectReady = !loading && Boolean(project);
    const subscriptionActive = Boolean(project?.access?.subscriptionActive);
    const paymentStepRequired = !subscriptionActive;
    const stepItems = buildWorkspaceSteps(subscriptionActive);
    const resultStepIndex = subscriptionActive ? 2 : 3;

    const handleQuestionnaireSaved = async () => {
        await loadProject();
        onProjectChanged?.();
        setActiveStep(1);
    };

    const handleCalculated = async () => {
        await loadProject();
        onProjectChanged?.();
        setActiveStep(resultStepIndex);
    };

    if (!projectId) {
        return (
            <div className="project-workspace-wrap">
                <Card className="project-workspace-card">
                    <Empty description="Проект не выбран" />
                </Card>
            </div>
        );
    }

    return (
        <div className="project-workspace-wrap">
            <Card loading={loading} className="project-workspace-card">
                <Space direction="vertical" style={{ width: '100%' }} size={24}>
                    <div>
                        <h2 style={{ marginBottom: 8 }}>{project?.name}</h2>

                        <Steps
                            current={activeStep}
                            items={stepItems}
                        />
                    </div>

                    {isProjectReady && activeStep === 0 && (
                        <ProjectQuestionnairePanel
                            projectId={projectId}
                            project={project}
                            onSaved={handleQuestionnaireSaved}
                        />
                    )}

                    {isProjectReady && activeStep === 1 && (
                        <ProjectValidationPanel
                            projectId={projectId}
                            project={project}
                            onBack={() => setActiveStep(0)}
                            onSaved={loadProject}
                            onNext={async () => {
                                try {
                                    await api.patch(`/projects/${projectId}`, { status: 'calculation' });

                                    if (subscriptionActive) {
                                        await api.post(`/projects/${projectId}/calculate`);
                                        await handleCalculated();
                                        return;
                                    }

                                    await loadProject();
                                    onProjectChanged?.();
                                    setActiveStep(2);
                                } catch (error) {
                                    message.error(
                                        error?.response?.data?.error || 'Не удалось перейти к следующему шагу'
                                    );
                                }
                            }}
                        />
                    )}

                    {isProjectReady && paymentStepRequired && activeStep === 2 && (
                        <ProjectPaymentPanel
                            projectId={projectId}
                            project={project}
                            onBack={() => setActiveStep(1)}
                            onPaymentChanged={async () => {
                                await loadProject();
                                onProjectChanged?.();
                            }}
                            onCalculated={handleCalculated}
                        />
                    )}

                    {isProjectReady && activeStep === resultStepIndex && (
                        <ProjectResultDetailedPanel
                            projectId={projectId}
                            project={project}
                            marketContext={marketContext}
                            onBack={() => setActiveStep(paymentStepRequired ? 2 : 1)}
                        />
                    )}
                </Space>
            </Card>
        </div>
    );
}
