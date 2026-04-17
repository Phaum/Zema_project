import React, { useEffect, useState } from 'react';
import { Alert, Table } from 'antd';
import { fetchAdminAudit } from './Api';

export default function AdminAuditTable() {
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [pageState, setPageState] = useState({ current: 1, pageSize: 20 });
    const [error, setError] = useState('');

    const loadData = async (page = 1, pageSize = 20) => {
        try {
            setLoading(true);
            setError('');
            const data = await fetchAdminAudit({ page, pageSize });
            setRows(data.items || []);
            setTotal(data.total || 0);
            setPageState({ current: data.page || page, pageSize: data.pageSize || pageSize });
        } catch (e) {
            console.error(e);
            setError(e?.response?.data?.error || 'Не удалось загрузить аудит');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 80 },
        { title: 'Админ', dataIndex: 'admin_user_id', width: 100 },
        { title: 'Сущность', dataIndex: 'entity_type' },
        { title: 'Entity ID', dataIndex: 'entity_id' },
        { title: 'Действие', dataIndex: 'action' },
        { title: 'Дата', dataIndex: 'createdAt' },
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