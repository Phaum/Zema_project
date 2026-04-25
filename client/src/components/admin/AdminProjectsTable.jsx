import React, { useEffect, useState } from 'react';
import { Alert, Button, message, Space, Table } from 'antd';
import {
    archiveAdminProject,
    deleteAdminProject,
    fetchAdminProjectById,
    fetchAdminProjects,
} from './Api';
import AdminProjectPreviewModal from './AdminProjectPreviewModal';

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

export default function AdminProjectsTable() {
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [pageState, setPageState] = useState({ current: 1, pageSize: 20 });
    const [error, setError] = useState('');
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewProject, setPreviewProject] = useState(null);
    const [previewError, setPreviewError] = useState('');

    const loadData = async (page = 1, pageSize = 20) => {
        try {
            setLoading(true);
            setError('');
            const data = await fetchAdminProjects({ page, pageSize });
            setRows(data.items || []);
            setTotal(data.total || 0);
            setPageState({ current: data.page || page, pageSize: data.pageSize || pageSize });
        } catch (e) {
            console.error(e);
            setError(e?.response?.data?.error || 'Не удалось загрузить проекты');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const openProjectPreview = async (projectId) => {
        try {
            setPreviewOpen(true);
            setPreviewLoading(true);
            setPreviewProject(null);
            setPreviewError('');

            const data = await fetchAdminProjectById(projectId);
            setPreviewProject(data);
        } catch (e) {
            console.error(e);
            setPreviewError(e?.response?.data?.error || 'Не удалось загрузить проект');
        } finally {
            setPreviewLoading(false);
        }
    };

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 80 },
        { title: 'Название', dataIndex: 'name' },
        { title: 'Тип объекта', dataIndex: 'object_type' },
        { title: 'Статус', dataIndex: 'status' },
        {
            title: 'Пользователь',
            dataIndex: 'user_id',
            render: (_, record) => record.user?.email || record.user_id,
        },
        {
            title: 'Дата расчета',
            dataIndex: ['result', 'updated_at'],
            width: 180,
            render: (_, record) => formatDateTime(resolveCalculationDate(record)),
        },
        {
            title: 'Действия',
            render: (_, record) => (
                <Space wrap>
                    <Button type="primary" onClick={() => openProjectPreview(record.id)}>
                        Просмотр
                    </Button>
                    <Button onClick={async () => {
                        await archiveAdminProject(record.id);
                        message.success('Проект архивирован');
                        loadData(pageState.current, pageState.pageSize);
                    }}>
                        В архив
                    </Button>
                    <Button danger onClick={async () => {
                        await deleteAdminProject(record.id);
                        message.success('Проект удалён');
                        loadData(pageState.current, pageState.pageSize);
                    }}>
                        Удалить
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div>
            {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}

            <Table
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={rows}
                pagination={{
                    current: pageState.current,
                    pageSize: pageState.pageSize,
                    total,
                    onChange: (page, pageSize) => loadData(page, pageSize),
                }}
            />

            <AdminProjectPreviewModal
                open={previewOpen}
                loading={previewLoading}
                project={previewProject}
                error={previewError}
                onClose={() => setPreviewOpen(false)}
            />
        </div>
    );
}
