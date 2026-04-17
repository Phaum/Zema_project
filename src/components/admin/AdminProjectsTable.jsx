import React, { useEffect, useState } from 'react';
import { Alert, Button, message, Space, Table } from 'antd';
import {
    archiveAdminProject,
    deleteAdminProject,
    fetchAdminProjects,
} from './Api';

export default function AdminProjectsTable() {
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [pageState, setPageState] = useState({ current: 1, pageSize: 20 });
    const [error, setError] = useState('');

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

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 80 },
        { title: 'Название', dataIndex: 'name' },
        { title: 'Тип объекта', dataIndex: 'object_type' },
        { title: 'Статус', dataIndex: 'status' },
        { title: 'Пользователь', dataIndex: 'user_id' },
        {
            title: 'Действия',
            render: (_, record) => (
                <Space wrap>
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
        </div>
    );
}