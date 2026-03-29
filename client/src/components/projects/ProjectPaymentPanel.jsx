import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Divider,
    Input,
    Radio,
    Row,
    Space,
    Steps,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    CheckCircleOutlined,
    CreditCardOutlined,
    FileTextOutlined,
    RocketOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import api from '../../components/projects/api';
import { useAuth } from '../../context/AuthContext';
import './ProjectPaymentPanel.css';

const { Paragraph, Title, Text } = Typography;

function formatCurrency(value) {
    return Number(value || 0).toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

function formatDateTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('ru-RU');
}

function AccessAlert({ accessSource, oneTimeStatus, subscriptionActive }) {
    if (accessSource === 'subscription') {
        return (
            <Alert
                type="success"
                showIcon
                message="Доступ к расчёту открыт по подписке"
                description="Для этого проекта единоразовая оплата не требуется: активная подписка уже разрешает формирование результата."
            />
        );
    }

    if (accessSource === 'one_time') {
        return (
            <Alert
                type="success"
                showIcon
                message="Единоразовая оплата подтверждена"
                description="Можно запускать расчёт и переходить к итоговому результату."
            />
        );
    }

    if (oneTimeStatus === 'pending') {
        return (
            <Alert
                type="warning"
                showIcon
                message="Счёт по проекту подготовлен"
                description="Подтвердите оплату или переключитесь на подписку, если она удобнее для текущего сценария."
            />
        );
    }

    if (subscriptionActive) {
        return (
            <Alert
                type="success"
                showIcon
                message="Подписка уже активна"
                description="Можно формировать результат сразу, даже без единоразовой оплаты по этому проекту."
            />
        );
    }

    return (
        <Alert
            type="info"
            showIcon
            message="Выберите сценарий оплаты"
            description="Можно либо оплатить конкретный проект один раз, либо активировать подписку на аккаунт и использовать её для расчётов."
        />
    );
}

function PlanCard({ plan, selected, disabled, onSelect, kind = 'subscription' }) {
    return (
        <Card
            className={`project-payment-tariff-card ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
            onClick={() => {
                if (!disabled) {
                    onSelect?.(plan.code);
                }
            }}
        >
            <div className="project-payment-tariff-head">
                <div>
                    <Title level={4} className="project-payment-tariff-title">
                        {plan.title}
                    </Title>
                    <Text type="secondary">
                        {kind === 'subscription'
                            ? `${plan.periodMonths} мес.`
                            : plan.turnaround}
                    </Text>
                </div>
                {selected ? <Tag color="blue">Выбран</Tag> : null}
            </div>

            <div className="project-payment-tariff-price">
                {formatCurrency(plan.price)} ₽
            </div>

            <Paragraph className="project-payment-tariff-description">
                {plan.description}
            </Paragraph>

            <div className="project-payment-tariff-features">
                {plan.features.map((feature) => (
                    <div key={feature} className="project-payment-tariff-feature">
                        {feature}
                    </div>
                ))}
            </div>
        </Card>
    );
}

export default function ProjectPaymentPanel({
    projectId,
    project,
    onBack,
    onCalculated,
    onPaymentChanged,
}) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [oneTimeInvoiceLoading, setOneTimeInvoiceLoading] = useState(false);
    const [oneTimeConfirming, setOneTimeConfirming] = useState(false);
    const [subscriptionInvoiceLoading, setSubscriptionInvoiceLoading] = useState(false);
    const [subscriptionConfirming, setSubscriptionConfirming] = useState(false);
    const [payment, setPayment] = useState(null);
    const [billingMode, setBillingMode] = useState('one_time');
    const [selectedTariffCode, setSelectedTariffCode] = useState('standard');
    const [selectedPlanCode, setSelectedPlanCode] = useState('monthly');
    const [billingEmail, setBillingEmail] = useState(user?.email || '');

    const loadPayment = async () => {
        try {
            const { data } = await api.get(`/projects/${projectId}/payment`);
            setPayment(data);
            setSelectedTariffCode(data?.selectedTariffCode || 'standard');
            setSelectedPlanCode(data?.subscription?.selectedPlanCode || 'monthly');
            setBillingEmail(
                data?.subscription?.invoiceEmail
                || data?.invoiceEmail
                || user?.email
                || ''
            );
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось загрузить данные оплаты');
        }
    };

    useEffect(() => {
        loadPayment();
    }, [projectId]);

    const selectedTariff = useMemo(
        () => payment?.tariffs?.find((item) => item.code === selectedTariffCode) || payment?.tariff || null,
        [payment, selectedTariffCode]
    );

    const selectedPlan = useMemo(
        () => payment?.subscription?.plans?.find((item) => item.code === selectedPlanCode) || payment?.subscription?.plan || null,
        [payment, selectedPlanCode]
    );

    const oneTimeStatus = payment?.status;
    const subscription = payment?.subscription;
    const subscriptionActive = Boolean(subscription?.active);
    const accessGranted = Boolean(payment?.accessGranted);
    const accessSource = payment?.accessSource || null;
    const canCalculate = accessGranted;

    const handleIssueOneTimeInvoice = async () => {
        try {
            setOneTimeInvoiceLoading(true);
            const { data } = await api.post(`/projects/${projectId}/payment/invoice`, {
                tariffCode: selectedTariffCode,
                invoiceEmail: billingEmail,
            });
            setPayment(data?.payment || null);
            message.success('Счёт по проекту подготовлен');
            await onPaymentChanged?.();
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось подготовить счёт');
        } finally {
            setOneTimeInvoiceLoading(false);
        }
    };

    const handleConfirmOneTimePayment = async () => {
        try {
            setOneTimeConfirming(true);
            const { data } = await api.post(`/projects/${projectId}/payment/confirm`);
            setPayment(data?.payment || null);
            message.success('Единоразовая оплата подтверждена');
            await onPaymentChanged?.();
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось подтвердить оплату');
        } finally {
            setOneTimeConfirming(false);
        }
    };

    const handleIssueSubscriptionInvoice = async () => {
        try {
            setSubscriptionInvoiceLoading(true);
            const { data } = await api.post(`/projects/${projectId}/payment/subscription/invoice`, {
                planCode: selectedPlanCode,
                invoiceEmail: billingEmail,
            });
            setPayment(data?.payment || null);
            message.success('Счёт на подписку подготовлен');
            await onPaymentChanged?.();
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось подготовить счёт на подписку');
        } finally {
            setSubscriptionInvoiceLoading(false);
        }
    };

    const handleConfirmSubscription = async () => {
        try {
            setSubscriptionConfirming(true);
            const { data } = await api.post(`/projects/${projectId}/payment/subscription/confirm`);
            setPayment(data?.payment || null);
            message.success('Подписка активирована');

            try {
                await api.post(`/projects/${projectId}/calculate`);
                message.success('Результат сформирован');
                onCalculated?.();
            } catch (calculationError) {
                await onPaymentChanged?.();
                message.error(
                    calculationError?.response?.data?.error || 'Подписка активирована, но результат пока не удалось сформировать'
                );
            }
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось активировать подписку');
        } finally {
            setSubscriptionConfirming(false);
        }
    };

    const handleCalculate = async () => {
        try {
            setLoading(true);
            await api.post(`/projects/${projectId}/calculate`);
            message.success('Результат сформирован');
            onCalculated?.();
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось сформировать результат');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="project-step-shell">
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <Card className="project-payment-hero">
                    <Title level={2}>
                        <CreditCardOutlined /> Оплата
                    </Title>
                    <Paragraph>
                        Для открытия расчёта доступны два сценария: единоразовая оплата за конкретный проект
                        или подписка на аккаунт, которая даёт доступ ко всем проектам в течение срока действия.
                    </Paragraph>

                    <Steps
                        current={canCalculate ? 2 : 1}
                        items={[
                            { title: 'Сценарий' },
                            { title: 'Оплата' },
                            { title: 'Расчёт' },
                        ]}
                    />
                </Card>

                <AccessAlert
                    accessSource={accessSource}
                    oneTimeStatus={oneTimeStatus}
                    subscriptionActive={subscriptionActive}
                />

                <Card>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                            <Text strong>Сценарий оплаты</Text>
                            <div className="project-payment-mode-switch">
                                <Radio.Group
                                    value={billingMode}
                                    onChange={(event) => setBillingMode(event.target.value)}
                                    optionType="button"
                                    buttonStyle="solid"
                                >
                                    <Radio.Button value="one_time">Единоразовая оплата</Radio.Button>
                                    <Radio.Button value="subscription">Подписка</Radio.Button>
                                </Radio.Group>
                            </div>
                        </div>

                        <div>
                            <Text className="project-payment-field-label">Email для счёта</Text>
                            <Input
                                value={billingEmail}
                                onChange={(event) => setBillingEmail(event.target.value)}
                                placeholder="Введите email для счёта"
                            />
                        </div>
                    </Space>
                </Card>

                {billingMode === 'one_time' ? (
                    <Row gutter={[16, 16]}>
                        <Col xs={24} xl={16}>
                            <Card title="Единоразовая оплата по проекту" extra={<Tag color="blue">За 1 проект</Tag>}>
                                <div className="project-payment-tariffs-grid">
                                    {(payment?.tariffs || []).map((tariff) => (
                                        <PlanCard
                                            key={tariff.code}
                                            plan={tariff}
                                            selected={selectedTariffCode === tariff.code}
                                            disabled={oneTimeStatus === 'paid'}
                                            onSelect={setSelectedTariffCode}
                                            kind="one_time"
                                        />
                                    ))}
                                </div>
                            </Card>
                        </Col>

                        <Col xs={24} xl={8}>
                            <Card title="Счёт по проекту" className="project-payment-summary-card">
                                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                    <div className="project-payment-summary-row">
                                        <Text type="secondary">Проект</Text>
                                        <Text strong>{payment?.projectSummary?.projectName || project?.name || '—'}</Text>
                                    </div>
                                    <div className="project-payment-summary-row">
                                        <Text type="secondary">Тариф</Text>
                                        <Text>{selectedTariff?.title || '—'}</Text>
                                    </div>
                                    <div className="project-payment-summary-row">
                                        <Text type="secondary">Номер счёта</Text>
                                        <Text>{payment?.invoiceNumber || 'будет создан'}</Text>
                                    </div>
                                    <div className="project-payment-summary-row">
                                        <Text type="secondary">Статус</Text>
                                        <Tag color={oneTimeStatus === 'paid' ? 'green' : oneTimeStatus === 'pending' ? 'orange' : 'default'}>
                                            {oneTimeStatus === 'paid' ? 'Оплачено' : oneTimeStatus === 'pending' ? 'Ожидает' : 'Не оплачено'}
                                        </Tag>
                                    </div>
                                    <Divider style={{ margin: '8px 0' }} />
                                    <div className="project-payment-summary-row is-total">
                                        <Text strong>К оплате</Text>
                                        <Title level={3} className="project-payment-summary-total">
                                            {formatCurrency(selectedTariff?.price || payment?.amount || 0)} ₽
                                        </Title>
                                    </div>
                                </Space>
                            </Card>
                        </Col>
                    </Row>
                ) : (
                    <Row gutter={[16, 16]}>
                        <Col xs={24} xl={16}>
                            <Card
                                title="Подписка на аккаунт"
                                extra={<Tag color={subscriptionActive ? 'green' : 'purple'}>{subscriptionActive ? 'Активна' : 'Для аккаунта'}</Tag>}
                            >
                                <div className="project-payment-tariffs-grid">
                                    {(subscription?.plans || []).map((plan) => (
                                        <PlanCard
                                            key={plan.code}
                                            plan={plan}
                                            selected={selectedPlanCode === plan.code}
                                            disabled={subscriptionActive}
                                            onSelect={setSelectedPlanCode}
                                            kind="subscription"
                                        />
                                    ))}
                                </div>
                            </Card>
                        </Col>

                        <Col xs={24} xl={8}>
                            <Card title="Статус подписки" className="project-payment-summary-card">
                                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                    <div className="project-payment-summary-row">
                                        <Text type="secondary">Текущий план</Text>
                                        <Text strong>{selectedPlan?.title || '—'}</Text>
                                    </div>
                                    <div className="project-payment-summary-row">
                                        <Text type="secondary">Номер счёта</Text>
                                        <Text>{subscription?.invoiceNumber || 'будет создан'}</Text>
                                    </div>
                                    <div className="project-payment-summary-row">
                                        <Text type="secondary">Статус</Text>
                                        <Tag color={subscriptionActive ? 'green' : 'default'}>
                                            {subscriptionActive ? 'Активна' : 'Не активна'}
                                        </Tag>
                                    </div>
                                    <div className="project-payment-summary-row">
                                        <Text type="secondary">Начало</Text>
                                        <Text>{formatDateTime(subscription?.startedAt)}</Text>
                                    </div>
                                    <div className="project-payment-summary-row">
                                        <Text type="secondary">Окончание</Text>
                                        <Text>{formatDateTime(subscription?.expiresAt)}</Text>
                                    </div>
                                    <Divider style={{ margin: '8px 0' }} />
                                    <div className="project-payment-summary-row is-total">
                                        <Text strong>К оплате</Text>
                                        <Title level={3} className="project-payment-summary-total">
                                            {formatCurrency(selectedPlan?.price || 0)} ₽
                                        </Title>
                                    </div>
                                </Space>
                            </Card>
                        </Col>
                    </Row>
                )}

                <Card title="Что это даёт" className="project-payment-billing-card">
                    {billingMode === 'one_time' ? (
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            <div className="project-payment-inline-meta">
                                <FileTextOutlined />
                                <span>Оплата относится только к текущему проекту.</span>
                            </div>
                            <div className="project-payment-inline-meta">
                                <RocketOutlined />
                                <span>После подтверждения можно сразу запускать расчёт по этому объекту.</span>
                            </div>
                            <div className="project-payment-inline-meta">
                                <CheckCircleOutlined />
                                <span>Другие проекты останутся неоплаченными.</span>
                            </div>
                        </Space>
                    ) : (
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            <div className="project-payment-inline-meta">
                                <ThunderboltOutlined />
                                <span>Активная подписка открывает расчёт сразу для всех проектов пользователя.</span>
                            </div>
                            <div className="project-payment-inline-meta">
                                <RocketOutlined />
                                <span>Подходит, если вы планируете работать с несколькими объектами или делать повторные пересчёты.</span>
                            </div>
                            <div className="project-payment-inline-meta">
                                <CheckCircleOutlined />
                                <span>Пока подписка активна, отдельная оплата по проектам не требуется.</span>
                            </div>
                        </Space>
                    )}
                </Card>
            </Space>

            <div className="project-step-actions">
                <div className="project-step-actions-left">
                    <Button onClick={onBack}>Назад</Button>
                </div>

                <div className="project-step-actions-right">
                    {billingMode === 'one_time' ? (
                        <>
                            {oneTimeStatus !== 'paid' && (
                                <Button onClick={handleIssueOneTimeInvoice} loading={oneTimeInvoiceLoading}>
                                    {oneTimeStatus === 'pending' ? 'Обновить счёт' : 'Подготовить счёт'}
                                </Button>
                            )}
                            {oneTimeStatus !== 'paid' && (
                                <Button
                                    type="primary"
                                    onClick={handleConfirmOneTimePayment}
                                    loading={oneTimeConfirming}
                                    disabled={oneTimeStatus !== 'pending'}
                                >
                                    Подтвердить оплату
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            {!subscriptionActive && (
                                <Button onClick={handleIssueSubscriptionInvoice} loading={subscriptionInvoiceLoading}>
                                    Подготовить счёт на подписку
                                </Button>
                            )}
                            {!subscriptionActive && (
                                <Button
                                    type="primary"
                                    onClick={handleConfirmSubscription}
                                    loading={subscriptionConfirming}
                                >
                                    Активировать подписку
                                </Button>
                            )}
                        </>
                    )}

                    <Button
                        type="primary"
                        loading={loading}
                        onClick={handleCalculate}
                        disabled={!canCalculate}
                    >
                        Сформировать результат
                    </Button>
                </div>
            </div>
        </div>
    );
}
