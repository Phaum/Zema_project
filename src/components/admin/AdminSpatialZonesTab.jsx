import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Input, message, Popconfirm, Row, Space, Table, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import {
    fetchAdminSpatialZones,
    deleteAdminSpatialZone,
} from './Api';
import SpatialZoneEditorModal from './SpatialZoneEditorModal';

export default function AdminSpatialZonesTab() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingRow, setEditingRow] = useState(null);

    const loadData = async (currentSearch = search) => {
        try {
            setLoading(true);
            const data = await fetchAdminSpatialZones({
                search: currentSearch || undefined,
            });
            setRows(data.items || []);
        } catch (error) {
            console.error(error);
            message.error(error?.response?.data?.error || 'Не удалось загрузить полигоны');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const columns = useMemo(() => [
        { title: 'ID', dataIndex: 'id', width: 90 },
        { title: 'Название', dataIndex: 'name' },
        {
            title: 'Код',
            dataIndex: 'code',
            width: 170,
            render: (value) => value || '—',
        },
        {
            title: 'Тип зоны',
            dataIndex: 'zone_type',
            width: 180,
            render: (value) => <Tag>{value}</Tag>,
        },
        {
            title: 'Приоритет',
            dataIndex: 'priority',
            width: 120,
            render: (value) => Number.isFinite(Number(value)) ? Number(value) : 0,
        },
        {
            title: 'Активна',
            dataIndex: 'is_active',
            width: 120,
            render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? 'Да' : 'Нет'}</Tag>,
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 180,
            render: (_, row) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        onClick={() => {
                            setEditingRow(row);
                            setEditorOpen(true);
                        }}
                    >
                        Изменить
                    </Button>

                    <Popconfirm
                        title="Удалить полигон?"
                        onConfirm={async () => {
                            try {
                                await deleteAdminSpatialZone(row.id);
                                message.success('Полигон удалён');
                                await loadData();
                            } catch (error) {
                                message.error(error?.response?.data?.error || 'Не удалось удалить полигон');
                            }
                        }}
                    >
                        <Button danger icon={<DeleteOutlined />}>
                            Удалить
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ], []);

    return (
        <Card className="sharp-card">
            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
                <Space>
                    <Input.Search
                        placeholder="Поиск по названию или коду"
                        allowClear
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onSearch={(value) => loadData(value)}
                        style={{ width: 280 }}
                    />
                    <Button icon={<ReloadOutlined />} onClick={() => loadData()}>
                        Обновить
                    </Button>
                </Space>

                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                        setEditingRow(null);
                        setEditorOpen(true);
                    }}
                >
                    Создать полигон
                </Button>
            </Space>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={loading}
                pagination={false}
            />

            <SpatialZoneEditorModal
                open={editorOpen}
                initialValue={editingRow}
                onCancel={() => {
                    setEditorOpen(false);
                    setEditingRow(null);
                }}
                onSaved={async () => {
                    setEditorOpen(false);
                    setEditingRow(null);
                    await loadData();
                }}
            />
        </Card>
    );
}
