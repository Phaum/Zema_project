import React, { useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Drawer,
    Form,
    Input,
    message,
    Select,
    Space,
    Switch,
    Table,
    Tag,
} from 'antd';
import {
    blockAdminUser,
    fetchAdminUserById,
    fetchAdminUsers,
    setAdminUserRoles,
    unblockAdminUser,
    updateAdminUser,
} from './Api';

const ROLE_OPTIONS = [
    { value: 'GUEST', label: 'Гость' },
    { value: 'USER', label: 'Пользователь' },
    { value: 'ADMIN_ANALYST', label: 'Администратор-аналитик' },
];

export default function AdminUsersTable() {
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [pageState, setPageState] = useState({ current: 1, pageSize: 20 });
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [form] = Form.useForm();

    const loadData = async (page = pageState.current, pageSize = pageState.pageSize, currentSearch = search) => {
        try {
            setLoading(true);
            setError('');
            const data = await fetchAdminUsers({
                page,
                pageSize,
                search: currentSearch || undefined,
            });
            setRows(data.items || []);
            setTotal(data.total || 0);
            setPageState({ current: data.page || page, pageSize: data.pageSize || pageSize });
        } catch (e) {
            console.error(e);
            setError(e?.response?.data?.error || 'Не удалось загрузить пользователей');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(1, 20, '');
    }, []);

    const openDrawer = async (record) => {
        try {
            setLoading(true);
            const fullUser = await fetchAdminUserById(record.id);
            const nextUser = fullUser || record;

            setSelectedUser(nextUser);
            form.setFieldsValue({
                first_name: nextUser.first_name || '',
                last_name: nextUser.last_name || '',
                email: nextUser.email || '',
                status: nextUser.status || 'active',
                debug_mode: Boolean(nextUser.debug_mode),
                roles: Array.isArray(nextUser.roles) ? nextUser.roles : [],
            });
            setDrawerOpen(true);
        } catch (e) {
            console.error(e);
            message.error(e?.response?.data?.error || 'Не удалось загрузить пользователя');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedUser) return;

        try {
            const values = await form.validateFields();

            await updateAdminUser(selectedUser.id, {
                first_name: values.first_name,
                last_name: values.last_name,
                email: values.email,
                status: values.status,
                debug_mode: Boolean(values.debug_mode),
            });

            await setAdminUserRoles(selectedUser.id, values.roles);

            message.success('Пользователь обновлён');
            setDrawerOpen(false);
            loadData();
        } catch (e) {
            console.error(e);
            message.error(e?.response?.data?.error || 'Не удалось сохранить пользователя');
        }
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            width: 80,
        },
        {
            title: 'Имя',
            render: (_, record) => [record.first_name, record.last_name].filter(Boolean).join(' ') || '—',
        },
        {
            title: 'Email',
            dataIndex: 'email',
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            render: (value) => (
                <Tag color={value === 'blocked' ? 'red' : 'green'}>
                    {value || '—'}
                </Tag>
            ),
        },
        {
            title: 'Debug',
            dataIndex: 'debug_mode',
            width: 120,
            render: (value) => (
                <Tag color={value ? 'gold' : 'default'}>
                    {value ? 'Вкл.' : 'Выкл.'}
                </Tag>
            ),
        },
        {
            title: 'Действия',
            render: (_, record) => (
                <Space wrap>
                    <Button onClick={() => openDrawer(record)}>Открыть</Button>
                    {record.status === 'blocked' ? (
                        <Button onClick={async () => {
                            await unblockAdminUser(record.id);
                            message.success('Пользователь разблокирован');
                            loadData();
                        }}>
                            Разблокировать
                        </Button>
                    ) : (
                        <Button danger onClick={async () => {
                            await blockAdminUser(record.id);
                            message.success('Пользователь заблокирован');
                            loadData();
                        }}>
                            Заблокировать
                        </Button>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <Space style={{ marginBottom: 16 }}>
                <Input.Search
                    allowClear
                    placeholder="Поиск по имени или email"
                    onSearch={(value) => {
                        setSearch(value);
                        loadData(1, pageState.pageSize, value);
                    }}
                    style={{ width: 320 }}
                />
            </Space>

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
                    onChange: (page, pageSize) => loadData(page, pageSize, search),
                }}
            />

            <Drawer
                title={selectedUser ? `Пользователь #${selectedUser.id}` : 'Пользователь'}
                open={drawerOpen}
                width={480}
                onClose={() => setDrawerOpen(false)}
                extra={<Button type="primary" onClick={handleSave}>Сохранить</Button>}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="first_name" label="Имя">
                        <Input />
                    </Form.Item>

                    <Form.Item name="last_name" label="Фамилия">
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[{ type: 'email', message: 'Введите корректный email' }]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item name="status" label="Статус">
                        <Select
                            options={[
                                { value: 'active', label: 'Активен' },
                                { value: 'blocked', label: 'Заблокирован' },
                            ]}
                        />
                    </Form.Item>

                    <Form.Item
                        name="debug_mode"
                        label="Режим отладки"
                        valuePropName="checked"
                        extra="При включении будут логироваться входящие и исходящие данные пользователя."
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item
                        name="roles"
                        label="Роль"
                        rules={[{ required: true, message: 'Выберите роль' }]}
                    >
                        <Select
                            options={ROLE_OPTIONS}
                            mode="multiple"
                            maxCount={1}
                        />
                    </Form.Item>
                </Form>
            </Drawer>
        </div>
    );
}
