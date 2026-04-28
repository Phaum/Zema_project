import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    DatePicker,
    Drawer,
    Form,
    Input,
    InputNumber,
    Popconfirm,
    Select,
    Space,
    Switch,
    Table,
    Tabs,
    Tag,
    Typography,
    message,
} from 'antd';
import dayjs from 'dayjs';
import { DeleteOutlined } from '@ant-design/icons';
import {
    createAdminBillingPlan,
    deleteAdminBillingPlan,
    fetchAdminBillingPlans,
    fetchAdminSubscriptions,
    updateAdminBillingPlan,
    updateAdminSubscription,
} from './Api';

const { TextArea } = Input;
const { Text } = Typography;
const { TabPane } = Tabs;

const KIND_OPTIONS = [
    { value: 'one_time', label: 'Единоразовая оплата' },
    { value: 'subscription', label: 'Подписка' },
];

const SUBSCRIPTION_STATUS_OPTIONS = [
    { value: 'inactive', label: 'Не активна' },
    { value: 'active', label: 'Активна' },
    { value: 'expired', label: 'Истекла' },
];

function formatCurrency(value) {
    return Number(value || 0).toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

function formatDateTime(value) {
    if (!value) return '—';
    return dayjs(value).isValid() ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—';
}

function formatSubscriptionStatusLabel(status, active) {
    if (active) return 'Активна';
    if (status === 'expired') return 'Истекла';
    if (status === 'inactive') return 'Не активна';
    return status || '—';
}

function normalizeFeaturesText(value) {
    return String(value || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

export default function AdminBillingTab() {
    const [plansLoading, setPlansLoading] = useState(false);
    const [plansError, setPlansError] = useState('');
    const [plans, setPlans] = useState([]);
    const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
    const [subscriptionsError, setSubscriptionsError] = useState('');
    const [subscriptions, setSubscriptions] = useState([]);
    const [subscriptionsTotal, setSubscriptionsTotal] = useState(0);
    const [subscriptionPage, setSubscriptionPage] = useState({ current: 1, pageSize: 20 });
    const [subscriptionSearch, setSubscriptionSearch] = useState('');
    const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState(undefined);
    const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
    const [subscriptionDrawerOpen, setSubscriptionDrawerOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [selectedSubscription, setSelectedSubscription] = useState(null);
    const [savingPlan, setSavingPlan] = useState(false);
    const [savingSubscription, setSavingSubscription] = useState(false);
    const [deletingPlanId, setDeletingPlanId] = useState(null);
    const [planForm] = Form.useForm();
    const [subscriptionForm] = Form.useForm();
    const watchedPlanKind = Form.useWatch('kind', planForm);

    const oneTimeTariffs = useMemo(
        () => plans.filter((item) => item.kind === 'one_time'),
        [plans]
    );
    const subscriptionPlans = useMemo(
        () => plans.filter((item) => item.kind === 'subscription'),
        [plans]
    );

    const loadPlans = async () => {
        try {
            setPlansLoading(true);
            setPlansError('');
            const data = await fetchAdminBillingPlans();
            setPlans(data?.items || []);
        } catch (error) {
            console.error(error);
            setPlansError(error?.response?.data?.error || 'Не удалось загрузить тарифы');
        } finally {
            setPlansLoading(false);
        }
    };

    const loadSubscriptions = async (
        page = subscriptionPage.current,
        pageSize = subscriptionPage.pageSize,
        search = subscriptionSearch,
        status = subscriptionStatusFilter
    ) => {
        try {
            setSubscriptionsLoading(true);
            setSubscriptionsError('');
            const data = await fetchAdminSubscriptions({
                page,
                pageSize,
                search: search || undefined,
                status: status || undefined,
            });
            setSubscriptions(data?.items || []);
            setSubscriptionsTotal(data?.total || 0);
            setSubscriptionPage({
                current: data?.page || page,
                pageSize: data?.pageSize || pageSize,
            });
        } catch (error) {
            console.error(error);
            setSubscriptionsError(error?.response?.data?.error || 'Не удалось загрузить подписки');
        } finally {
            setSubscriptionsLoading(false);
        }
    };

    useEffect(() => {
        loadPlans();
        loadSubscriptions(1, 20, '', undefined);
    }, []);

    const openPlanDrawer = (record = null, kind = 'one_time') => {
        setSelectedPlan(record);
        planForm.setFieldsValue({
            kind: record?.kind || kind,
            code: record?.code || '',
            title: record?.title || '',
            price: Number(record?.price || 0),
            currency: record?.currency || 'RUB',
            turnaround: record?.turnaround || '',
            periodMonths: record?.periodMonths ?? null,
            description: record?.description || '',
            featuresText: Array.isArray(record?.features) ? record.features.join('\n') : '',
            sortOrder: record?.sortOrder ?? 100,
            isActive: record?.isActive !== false,
        });
        setPlanDrawerOpen(true);
    };

    const openSubscriptionDrawer = (record) => {
        setSelectedSubscription(record);
        subscriptionForm.setFieldsValue({
            status: record?.status || 'inactive',
            planCode: record?.planCode || undefined,
            startedAt: record?.startedAt ? dayjs(record.startedAt) : null,
            expiresAt: record?.expiresAt ? dayjs(record.expiresAt) : null,
            invoiceEmail: record?.invoiceEmail || '',
            notes: record?.notes || '',
        });
        setSubscriptionDrawerOpen(true);
    };

    const handleSavePlan = async () => {
        try {
            const values = await planForm.validateFields();
            setSavingPlan(true);

            const payload = {
                kind: values.kind,
                code: values.code,
                title: values.title,
                price: values.price,
                currency: values.currency,
                turnaround: values.kind === 'one_time' ? values.turnaround : null,
                periodMonths: values.kind === 'subscription' ? values.periodMonths : null,
                description: values.description,
                features: normalizeFeaturesText(values.featuresText),
                sortOrder: values.sortOrder,
                isActive: values.isActive !== false,
            };

            if (selectedPlan?.id) {
                await updateAdminBillingPlan(selectedPlan.id, payload);
                message.success('Вариант оплаты обновлён');
            } else {
                await createAdminBillingPlan(payload);
                message.success('Вариант оплаты создан');
            }

            setPlanDrawerOpen(false);
            await loadPlans();
        } catch (error) {
            if (!error?.errorFields) {
                console.error(error);
                message.error(error?.response?.data?.error || 'Не удалось сохранить вариант оплаты');
            }
        } finally {
            setSavingPlan(false);
        }
    };

    const handleSaveSubscription = async () => {
        if (!selectedSubscription) {
            return;
        }

        try {
            const values = await subscriptionForm.validateFields();
            setSavingSubscription(true);

            await updateAdminSubscription(selectedSubscription.id, {
                status: values.status,
                planCode: values.planCode,
                startedAt: values.startedAt ? values.startedAt.toISOString() : null,
                expiresAt: values.expiresAt ? values.expiresAt.toISOString() : null,
                invoiceEmail: values.invoiceEmail || null,
                notes: values.notes || '',
            });

            message.success('Подписка обновлена');
            setSubscriptionDrawerOpen(false);
            await loadSubscriptions();
        } catch (error) {
            if (!error?.errorFields) {
                console.error(error);
                message.error(error?.response?.data?.error || 'Не удалось обновить подписку');
            }
        } finally {
            setSavingSubscription(false);
        }
    };

    const handleDeletePlan = async (record) => {
        if (!record?.id) {
            return;
        }

        try {
            setDeletingPlanId(record.id);
            await deleteAdminBillingPlan(record.id);
            message.success('Тариф удалён');
            await loadPlans();
        } catch (error) {
            console.error(error);
            message.error(error?.response?.data?.error || 'Не удалось удалить тариф');
        } finally {
            setDeletingPlanId(null);
        }
    };

    const planColumns = [
        {
            title: 'Название',
            dataIndex: 'title',
            render: (_, record) => (
                <Space direction="vertical" size={2}>
                    <Text strong>{record.title}</Text>
                    <Text type="secondary">{record.code}</Text>
                </Space>
            ),
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            width: 140,
            render: (value) => `${formatCurrency(value)} ₽`,
        },
        {
            title: 'Условия',
            width: 180,
            render: (_, record) => record.kind === 'subscription'
                ? `${record.periodMonths || '—'} мес.`
                : (record.turnaround || '—'),
        },
        {
            title: 'Статус',
            dataIndex: 'isActive',
            width: 120,
            render: (value) => (
                <Tag color={value ? 'green' : 'default'}>
                    {value ? 'Активен' : 'Выключен'}
                </Tag>
            ),
        },
        {
            title: 'Действия',
            width: 210,
            render: (_, record) => (
                <Space>
                    <Button onClick={() => openPlanDrawer(record, record.kind)}>
                        Открыть
                    </Button>
                    <Popconfirm
                        title="Удалить тариф?"
                        description="Тариф исчезнет из админки и каталога оплаты. Исторические проекты и подписки сохранят код тарифа."
                        okText="Удалить"
                        cancelText="Отмена"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeletePlan(record)}
                    >
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            loading={deletingPlanId === record.id}
                        >
                            Удалить
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const subscriptionColumns = [
        {
            title: 'Пользователь',
            render: (_, record) => (
                <Space direction="vertical" size={2}>
                    <Text strong>{record.fullName}</Text>
                    <Text type="secondary">{record.email}</Text>
                </Space>
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 140,
            render: (_, record) => (
                <Tag color={record.active ? 'green' : record.status === 'expired' ? 'orange' : 'default'}>
                    {formatSubscriptionStatusLabel(record.status, record.active)}
                </Tag>
            ),
        },
        {
            title: 'План',
            dataIndex: 'planTitle',
            width: 220,
        },
        {
            title: 'Окончание',
            dataIndex: 'expiresAt',
            width: 170,
            render: (value) => formatDateTime(value),
        },
        {
            title: 'Действия',
            width: 120,
            render: (_, record) => (
                <Button onClick={() => openSubscriptionDrawer(record)}>
                    Открыть
                </Button>
            ),
        },
    ];

    return (
        <div>
            <Tabs>
                <TabPane tab="Тарифы и планы" key="plans">
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        {plansError ? <Alert type="error" showIcon message={plansError} /> : null}

                        <Card
                            title="Единоразовая оплата"
                            extra={<Button onClick={() => openPlanDrawer(null, 'one_time')}>Добавить тариф</Button>}
                        >
                            <Table
                                rowKey="id"
                                loading={plansLoading}
                                columns={planColumns}
                                dataSource={oneTimeTariffs}
                                pagination={false}
                            />
                        </Card>

                        <Card
                            title="Подписки"
                            extra={<Button onClick={() => openPlanDrawer(null, 'subscription')}>Добавить план</Button>}
                        >
                            <Table
                                rowKey="id"
                                loading={plansLoading}
                                columns={planColumns}
                                dataSource={subscriptionPlans}
                                pagination={false}
                            />
                        </Card>
                    </Space>
                </TabPane>

                <TabPane tab="Подписки пользователей" key="subscriptions">
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Space wrap>
                            <Input.Search
                                allowClear
                                placeholder="Поиск по email или имени"
                                style={{ width: 320 }}
                                onSearch={(value) => {
                                    setSubscriptionSearch(value);
                                    loadSubscriptions(1, subscriptionPage.pageSize, value, subscriptionStatusFilter);
                                }}
                            />
                            <Select
                                allowClear
                                placeholder="Статус подписки"
                                style={{ width: 220 }}
                                options={SUBSCRIPTION_STATUS_OPTIONS}
                                value={subscriptionStatusFilter}
                                onChange={(value) => {
                                    setSubscriptionStatusFilter(value);
                                    loadSubscriptions(1, subscriptionPage.pageSize, subscriptionSearch, value);
                                }}
                            />
                        </Space>

                        {subscriptionsError ? <Alert type="error" showIcon message={subscriptionsError} /> : null}

                        <Table
                            rowKey="id"
                            loading={subscriptionsLoading}
                            columns={subscriptionColumns}
                            dataSource={subscriptions}
                            pagination={{
                                current: subscriptionPage.current,
                                pageSize: subscriptionPage.pageSize,
                                total: subscriptionsTotal,
                                onChange: (page, pageSize) => {
                                    loadSubscriptions(page, pageSize, subscriptionSearch, subscriptionStatusFilter);
                                },
                            }}
                        />
                    </Space>
                </TabPane>
            </Tabs>

            <Drawer
                title={selectedPlan ? `Вариант оплаты #${selectedPlan.id}` : 'Новый вариант оплаты'}
                open={planDrawerOpen}
                width={520}
                onClose={() => setPlanDrawerOpen(false)}
                extra={
                    <Button type="primary" loading={savingPlan} onClick={handleSavePlan}>
                        Сохранить
                    </Button>
                }
            >
                <Form form={planForm} layout="vertical">
                    <Form.Item
                        name="kind"
                        label="Тип"
                        rules={[{ required: true, message: 'Выберите тип' }]}
                    >
                        <Select options={KIND_OPTIONS} />
                    </Form.Item>

                    <Form.Item
                        name="title"
                        label="Название"
                        rules={[{ required: true, message: 'Введите название' }]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="code"
                        label="Код"
                        rules={[{ required: true, message: 'Введите код' }]}
                    >
                        <Input placeholder="Например: standard" disabled={Boolean(selectedPlan)} />
                    </Form.Item>

                    <Form.Item
                        name="price"
                        label="Цена"
                        rules={[{ required: true, message: 'Введите цену' }]}
                    >
                        <InputNumber min={0} className="full-width" />
                    </Form.Item>

                    <Form.Item name="currency" label="Валюта">
                        <Input />
                    </Form.Item>

                    {watchedPlanKind === 'one_time' ? (
                        <Form.Item
                            name="turnaround"
                            label="Срок/режим обработки"
                            rules={[{ required: true, message: 'Укажите срок обработки' }]}
                        >
                            <Input placeholder="Например: До 1 рабочего дня" />
                        </Form.Item>
                    ) : (
                        <Form.Item
                            name="periodMonths"
                            label="Срок действия, мес."
                            rules={[{ required: true, message: 'Укажите срок действия' }]}
                        >
                            <InputNumber min={1} className="full-width" />
                        </Form.Item>
                    )}

                    <Form.Item name="description" label="Описание">
                        <TextArea rows={4} />
                    </Form.Item>

                    <Form.Item name="featuresText" label="Преимущества, по одному в строке">
                        <TextArea rows={6} />
                    </Form.Item>

                    <Form.Item name="sortOrder" label="Порядок сортировки">
                        <InputNumber min={0} className="full-width" />
                    </Form.Item>

                    <Form.Item name="isActive" label="Активен" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Drawer>

            <Drawer
                title={selectedSubscription ? `Подписка пользователя #${selectedSubscription.id}` : 'Подписка'}
                open={subscriptionDrawerOpen}
                width={520}
                onClose={() => setSubscriptionDrawerOpen(false)}
                extra={
                    <Button type="primary" loading={savingSubscription} onClick={handleSaveSubscription}>
                        Сохранить
                    </Button>
                }
            >
                <Form form={subscriptionForm} layout="vertical">
                    <Form.Item
                        name="status"
                        label="Статус"
                        rules={[{ required: true, message: 'Выберите статус' }]}
                    >
                        <Select options={SUBSCRIPTION_STATUS_OPTIONS} />
                    </Form.Item>

                    <Form.Item name="planCode" label="План">
                        <Select
                            allowClear
                            options={subscriptionPlans.map((item) => ({
                                value: item.code,
                                label: item.title,
                            }))}
                        />
                    </Form.Item>

                    <Form.Item name="startedAt" label="Дата начала">
                        <DatePicker showTime className="full-width" format="DD.MM.YYYY HH:mm" />
                    </Form.Item>

                    <Form.Item name="expiresAt" label="Дата окончания">
                        <DatePicker showTime className="full-width" format="DD.MM.YYYY HH:mm" />
                    </Form.Item>

                    <Form.Item
                        name="invoiceEmail"
                        label="Email для счёта"
                        rules={[{ type: 'email', message: 'Введите корректный email' }]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item name="notes" label="Примечание администратора">
                        <TextArea rows={4} />
                    </Form.Item>
                </Form>
            </Drawer>
        </div>
    );
}
