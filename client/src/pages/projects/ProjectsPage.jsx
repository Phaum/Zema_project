import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Empty,
    Form,
    List,
    Space,
    Tag,
    Typography,
    message,
    Modal,
} from 'antd';
import { FolderOpenOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../components/projects/api';
import ProjectWorkspace from './ProjectWorkspace';
import CreateProjectModal from '../../components/projects/CreateProjectModal';
import '../../components/projects/projects.css';
import { useAuth } from '../../context/AuthContext';
import {
    getLastProjectStorageKey,
    normalizeUserSettings,
} from '../../shared/userSettings';

const { Title, Text } = Typography;

export default function ProjectsPage() {
    const { user, settings } = useAuth();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [form] = Form.useForm();
    const userSettings = useMemo(
        () => normalizeUserSettings(settings),
        [settings]
    );
    const lastProjectStorageKey = useMemo(
        () => getLastProjectStorageKey(user?.id),
        [user?.id]
    );

    const rememberProjectSelection = useCallback(
        (projectId) => {
            if (!userSettings.rememberLastProject || !projectId) return;
            localStorage.setItem(lastProjectStorageKey, String(projectId));
        },
        [lastProjectStorageKey, userSettings.rememberLastProject]
    );

    const loadProjects = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/projects');
            setProjects(data || []);

            const savedProjectId = userSettings.rememberLastProject
                ? Number(localStorage.getItem(lastProjectStorageKey) || 0) || null
                : null;

            if (!userSettings.rememberLastProject) {
                localStorage.removeItem(lastProjectStorageKey);
            }

            if (!selectedProjectId && data?.length) {
                const preferredProject = savedProjectId
                    ? data.find((project) => project.id === savedProjectId)
                    : null;
                setSelectedProjectId(preferredProject?.id || data[0].id);
            }

            if (selectedProjectId && data?.length) {
                const exists = data.some((p) => p.id === selectedProjectId);
                if (!exists) {
                    const preferredProject = savedProjectId
                        ? data.find((project) => project.id === savedProjectId)
                        : null;
                    setSelectedProjectId(preferredProject?.id || data[0].id);
                }
            }
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось загрузить проекты');
        } finally {
            setLoading(false);
        }
    }, [lastProjectStorageKey, selectedProjectId, userSettings.rememberLastProject]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    useEffect(() => {
        if (selectedProjectId) {
            rememberProjectSelection(selectedProjectId);
        }
    }, [rememberProjectSelection, selectedProjectId]);

    const handleCreate = async () => {
        try {
            const values = await form.validateFields();
            setCreateLoading(true);

            const { data } = await api.post('/projects', values);

            setProjects((prev) => [data, ...prev]);
            setSelectedProjectId(data.id);
            rememberProjectSelection(data.id);
            setCreateOpen(false);
            form.resetFields();

            message.success('Проект создан');
        } catch (error) {
            if (!error?.errorFields) {
                message.error(error?.response?.data?.error || 'Не удалось создать проект');
            }
        } finally {
            setCreateLoading(false);
        }
    };

    const deleteProject = useCallback(
        async (projectId) => {
            try {
                await api.delete(`/projects/${projectId}`);
                setProjects((prev) => prev.filter((p) => p.id !== projectId));

                if (selectedProjectId === projectId) {
                    setSelectedProjectId(null);
                }

                const savedProjectId = Number(localStorage.getItem(lastProjectStorageKey) || 0) || null;
                if (savedProjectId === projectId) {
                    localStorage.removeItem(lastProjectStorageKey);
                }

                message.success('Проект удалён');
            } catch (error) {
                message.error(error?.response?.data?.error || 'Не удалось удалить проект');
            }
        },
        [lastProjectStorageKey, selectedProjectId]
    );

    const handleDeleteProject = (projectId, projectName) => {
        if (!userSettings.confirmImportantActions) {
            deleteProject(projectId);
            return;
        }

        Modal.confirm({
            title: 'Удалить проект?',
            content: `Вы уверены, что хотите удалить проект "${projectName}"? Это действие невозможно отменить.`,
            okText: 'Удалить',
            okType: 'danger',
            cancelText: 'Отмена',
            onOk: async () => {
                await deleteProject(projectId);
            },
        });
    };

    useEffect(() => {
        if (!userSettings.rememberLastProject) {
            localStorage.removeItem(lastProjectStorageKey);
        }
    }, [lastProjectStorageKey, userSettings.rememberLastProject]);

    return (
        <div className="projects-layout">
            <Card className="projects-sidebar-card">
                <Space className="projects-sidebar-header">
                    <Title level={3} style={{ margin: 0 }}>
                        Мои проекты
                    </Title>

                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreateOpen(true)}
                    >
                        Создать
                    </Button>
                </Space>

                <div className="projects-list-wrap">
                    {!projects.length && !loading ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="Пока нет проектов"
                        />
                    ) : (
                        <List
                            loading={loading}
                            dataSource={projects}
                            renderItem={(project) => (
                                <List.Item
                                    className={`project-list-item ${
                                        selectedProjectId === project.id ? 'active' : ''
                                    }`}
                                    onClick={() => {
                                        setSelectedProjectId(project.id);
                                        rememberProjectSelection(project.id);
                                    }}
                                    actions={[
                                        <Button
                                            type="text"
                                            danger
                                            icon={<DeleteOutlined />}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteProject(project.id, project.name);
                                            }}
                                            title="Удалить проект"
                                        />,
                                    ]}
                                >
                                    <List.Item.Meta
                                        avatar={<FolderOpenOutlined className="project-list-icon" />}
                                        title={
                                            <Space wrap>
                                                <span>{project.name}</span>
                                                <Tag>{project.status}</Tag>
                                            </Space>
                                        }
                                        description={
                                            <Text type="secondary">
                                                {project.questionnaire?.objectType || project.object_type || 'Тип не указан'}
                                            </Text>
                                        }
                                    />
                                </List.Item>
                            )}
                        />
                    )}
                </div>
            </Card>

            <div className="projects-main">
                {selectedProjectId ? (
                    <ProjectWorkspace
                        key={selectedProjectId}
                        projectId={selectedProjectId}
                        onProjectChanged={loadProjects}
                    />
                ) : (
                    <Card>
                        <Empty description="Выберите проект или создайте новый" />
                    </Card>
                )}
            </div>

            <CreateProjectModal
                open={createOpen}
                form={form}
                confirmLoading={createLoading}
                onCancel={() => setCreateOpen(false)}
                onOk={handleCreate}
            />
        </div>
    );
}
