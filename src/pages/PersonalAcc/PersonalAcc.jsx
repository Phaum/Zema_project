import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Card,
    Button,
    Typography,
    Divider,
    Avatar,
    Empty,
    Spin,
    message,
    Input,
    Switch,
    Tag,
    Form,
    Alert,
} from 'antd';
import {
    UserOutlined,
    MailOutlined,
    VideoCameraOutlined,
    LogoutOutlined,
    EditOutlined,
    FileSearchOutlined,
    SettingOutlined,
    ReloadOutlined,
    SaveOutlined,
    CreditCardOutlined,
} from '@ant-design/icons';
import './PersonalAcc.css';
import bgImage from '../../images/zema_background.jpg';
import AdminPage from '../../components/admin/AdminPage';
import ProjectsPage from '../projects/ProjectsPage';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../shared/api';
import {
    DEFAULT_USER_SETTINGS,
    normalizeUserSettings,
} from '../../shared/userSettings';

const { Title, Paragraph, Text } = Typography;

const PersonalAcc = () => {
    const [activeMenu, setActiveMenu] = useState('projects');
    const [settingsDraft, setSettingsDraft] = useState(DEFAULT_USER_SETTINGS);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [emailSaving, setEmailSaving] = useState(false);
    const [subscriptionInfo, setSubscriptionInfo] = useState(null);
    const [subscriptionLoading, setSubscriptionLoading] = useState(false);
    const [subscriptionActionLoading, setSubscriptionActionLoading] = useState(false);
    const [selectedSubscriptionPlanCode, setSelectedSubscriptionPlanCode] = useState('');
    const [subscriptionInvoiceEmail, setSubscriptionInvoiceEmail] = useState('');
    const [emailForm] = Form.useForm();
    const {
        user: profile,
        settings,
        updateSettings,
        updateEmail,
        logout,
        refreshProfile,
        isLoading: authLoading,
    } = useAuth();

    useEffect(() => {
        if (!profile) {
            refreshProfile().catch((error) => {
                console.error('Не удалось загрузить профиль', error);
                message.error('Не удалось загрузить профиль');
            });
        }
    }, [profile, refreshProfile]);

    useEffect(() => {
        setSettingsDraft(normalizeUserSettings(settings));
    }, [settings]);

    const displayName = useMemo(() => {
        if (!profile) return 'Загрузка...';
        return [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;
    }, [profile]);

    const isAdmin = useMemo(() => {
        const roles = Array.isArray(profile?.roles) ? profile.roles : [];
        return roles.includes('ADMIN_ANALYST');
    }, [profile]);

    const profileLoading = authLoading && !profile;
    const normalizedCurrentSettings = useMemo(
        () => normalizeUserSettings(settings),
        [settings]
    );
    const hasSettingsChanges = useMemo(
        () => JSON.stringify(settingsDraft) !== JSON.stringify(normalizedCurrentSettings),
        [settingsDraft, normalizedCurrentSettings]
    );

    const sidebarItems = useMemo(() => {
        const baseItems = [
            { key: 'projects', icon: <FileSearchOutlined />, label: 'Мои проекты' },
            { key: 'subscriptions', icon: <CreditCardOutlined />, label: 'Мои подписки' },
            { key: 'settings', icon: <EditOutlined />, label: 'Настройки' },
            { key: 'video', icon: <VideoCameraOutlined />, label: 'Обучающее видео' },
            { key: 'email', icon: <MailOutlined />, label: 'Смена Email' },
        ];

        if (isAdmin) {
            baseItems.push({
                key: 'admin',
                icon: <SettingOutlined />,
                label: 'Администрирование',
            });
        }

        baseItems.push({
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Выход',
        });

        return baseItems;
    }, [isAdmin]);

    const handleSidebarClick = (key) => {
        if (key === 'logout') {
            logout();
            window.location.href = '/login';
            return;
        }
        setActiveMenu(key);
    };

    const handleSettingChange = (key, value) => {
        setSettingsDraft((prev) => ({
            ...prev,
            [key]: Boolean(value),
        }));
    };

    const handleSaveSettings = async () => {
        try {
            setSettingsSaving(true);
            await updateSettings(settingsDraft);
            message.success('Настройки сохранены');
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось сохранить настройки');
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleResetSettings = () => {
        setSettingsDraft(DEFAULT_USER_SETTINGS);
    };

    const handleEmailChange = async () => {
        try {
            const values = await emailForm.validateFields();
            setEmailSaving(true);
            await updateEmail(values);
            emailForm.resetFields();
            message.success('Email успешно обновлён');
        } catch (error) {
            if (!error?.errorFields) {
                message.error(error?.response?.data?.error || 'Не удалось обновить email');
            }
        } finally {
            setEmailSaving(false);
        }
    };

    const loadSubscriptionInfo = useCallback(async () => {
        try {
            setSubscriptionLoading(true);
            const { data } = await api.get('/profile/subscription');
            setSubscriptionInfo(data?.subscription || null);
        } catch (error) {
            console.error('Не удалось загрузить подписку', error);
            message.error(error?.response?.data?.error || 'Не удалось загрузить данные по подписке');
        } finally {
            setSubscriptionLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeMenu === 'subscriptions' && !subscriptionInfo && !subscriptionLoading) {
            loadSubscriptionInfo();
        }
    }, [activeMenu, subscriptionInfo, subscriptionLoading, loadSubscriptionInfo]);

    useEffect(() => {
        const plans = Array.isArray(subscriptionInfo?.plans) ? subscriptionInfo.plans : [];
        const fallbackPlanCode = subscriptionInfo?.selectedPlanCode || plans[0]?.code || '';
        const fallbackInvoiceEmail = subscriptionInfo?.invoiceEmail || profile?.email || '';

        setSelectedSubscriptionPlanCode((prev) => prev || fallbackPlanCode);
        setSubscriptionInvoiceEmail((prev) => prev || fallbackInvoiceEmail);
    }, [subscriptionInfo, profile?.email]);

    const formatMoney = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '—';

        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0,
        }).format(numeric);
    };

    const formatDate = (value) => {
        if (!value) return '—';

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '—';

        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        }).format(parsed);
    };

    const getSubscriptionStatusMeta = (status, active) => {
        if (active) {
            return { label: 'Активна', color: 'green' };
        }

        if (status === 'expired') {
            return { label: 'Истекла', color: 'orange' };
        }

        return { label: 'Неактивна', color: 'default' };
    };

    const handleCreateSubscriptionInvoice = async () => {
        try {
            if (!selectedSubscriptionPlanCode) {
                message.warning('Сначала выберите план подписки');
                return;
            }

            setSubscriptionActionLoading(true);
            const { data } = await api.post('/profile/subscription/invoice', {
                planCode: selectedSubscriptionPlanCode,
                invoiceEmail: subscriptionInvoiceEmail,
            });

            setSubscriptionInfo(data?.subscription || null);
            message.success(data?.message || 'Счёт на подписку подготовлен');
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось подготовить счёт на подписку');
        } finally {
            setSubscriptionActionLoading(false);
        }
    };

    const handleConfirmSubscriptionPayment = async () => {
        try {
            if (!selectedSubscriptionPlanCode) {
                message.warning('Сначала выберите план подписки');
                return;
            }

            setSubscriptionActionLoading(true);
            const { data } = await api.post('/profile/subscription/confirm', {
                planCode: selectedSubscriptionPlanCode,
            });

            setSubscriptionInfo(data?.subscription || null);
            message.success(data?.message || 'Подписка активирована');
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось активировать подписку');
        } finally {
            setSubscriptionActionLoading(false);
        }
    };

    const renderProjectsSection = () => {
        return <ProjectsPage />;
    };

    const renderMainContent = () => {
        if (activeMenu === 'projects') {
            return renderProjectsSection();
        }

        if (activeMenu === 'admin') {
            return <AdminPage />;
        }

        if (activeMenu === 'settings') {
            return (
                <Card className="sharp-card">
                    <Title level={2} className="section-title">Настройки</Title>

                    <Paragraph className="settings-description">
                        Здесь можно настроить поведение интерфейса под свой рабочий сценарий.
                        Изменения для отображения анкеты, проектов и компактного режима применяются сразу после сохранения.
                    </Paragraph>

                    <div className="settings-panel">
                        <div className="settings-group">
                            <div className="settings-group-head">
                                <Title level={4} className="settings-group-title">
                                    Интерфейс
                                </Title>
                                <Tag color="blue">Применяется сразу</Tag>
                            </div>

                            <div className="settings-item">
                                <div>
                                    <Text strong>Компактный режим</Text>
                                    <div className="settings-item-hint">
                                        Уплотняет карточки, формы и таблицы во всём кабинете.
                                    </div>
                                </div>
                                <Switch
                                    checked={settingsDraft.compactMode}
                                    onChange={(value) => handleSettingChange('compactMode', value)}
                                />
                            </div>

                            <div className="settings-item">
                                <div>
                                    <Text strong>Показывать подсказки в анкете</Text>
                                    <div className="settings-item-hint">
                                        Оставляет поясняющие тексты и информационные сообщения на этапе заполнения опросного листа.
                                    </div>
                                </div>
                                <Switch
                                    checked={settingsDraft.showQuestionnaireHints}
                                    onChange={(value) => handleSettingChange('showQuestionnaireHints', value)}
                                />
                            </div>
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-head">
                                <Title level={4} className="settings-group-title">
                                    Работа с проектами
                                </Title>
                                <Tag color="green">Рабочие настройки</Tag>
                            </div>

                            <div className="settings-item">
                                <div>
                                    <Text strong>Подтверждение важных действий</Text>
                                    <div className="settings-item-hint">
                                        Показывает подтверждение перед удалением проекта и другими потенциально рискованными действиями.
                                    </div>
                                </div>
                                <Switch
                                    checked={settingsDraft.confirmImportantActions}
                                    onChange={(value) => handleSettingChange('confirmImportantActions', value)}
                                />
                            </div>

                            <div className="settings-item">
                                <div>
                                    <Text strong>Запоминать последний открытый проект</Text>
                                    <div className="settings-item-hint">
                                        При следующем входе кабинет откроет тот проект, с которым вы работали последним.
                                    </div>
                                </div>
                                <Switch
                                    checked={settingsDraft.rememberLastProject}
                                    onChange={(value) => handleSettingChange('rememberLastProject', value)}
                                />
                            </div>
                        </div>

                        <div className="settings-group">
                            <div className="settings-group-head">
                                <Title level={4} className="settings-group-title">
                                    Уведомления
                                </Title>
                                <Tag>Сохранение профиля</Tag>
                            </div>

                            <div className="settings-item">
                                <div>
                                    <Text strong>Email-уведомления</Text>
                                    <div className="settings-item-hint">
                                        Сохраняется в профиле и будет использовано для рассылки статусов и системных событий.
                                    </div>
                                </div>
                                <Switch
                                    checked={settingsDraft.emailNotifications}
                                    onChange={(value) => handleSettingChange('emailNotifications', value)}
                                />
                            </div>

                            <div className="settings-item">
                                <div>
                                    <Text strong>Уведомления в личном кабинете</Text>
                                    <div className="settings-item-hint">
                                        Сохраняется как пользовательское предпочтение для внутренних уведомлений платформы.
                                    </div>
                                </div>
                                <Switch
                                    checked={settingsDraft.cabinetNotifications}
                                    onChange={(value) => handleSettingChange('cabinetNotifications', value)}
                                />
                            </div>
                        </div>

                        <div className="settings-note">
                            <Text>
                                Настройки сохраняются за пользователем в базе данных и подгружаются при следующем входе в систему.
                            </Text>
                        </div>

                        <div className="settings-actions">
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={handleResetSettings}
                            >
                                Сбросить к умолчанию
                            </Button>

                            <Button
                                type="primary"
                                className="sharp-btn"
                                icon={<SaveOutlined />}
                                onClick={handleSaveSettings}
                                loading={settingsSaving}
                                disabled={!hasSettingsChanges}
                            >
                                Сохранить настройки
                            </Button>
                        </div>
                    </div>
                </Card>
            );
        }

        if (activeMenu === 'subscriptions') {
            const subscription = subscriptionInfo;
            const statusMeta = getSubscriptionStatusMeta(
                subscription?.status,
                subscription?.active
            );
            const plans = Array.isArray(subscription?.plans) ? subscription.plans : [];

            return (
                <Card className="sharp-card">
                    <div className="subscriptions-head">
                        <div>
                            <Title level={2} className="section-title">Мои подписки</Title>
                            <Paragraph className="subscriptions-description">
                                Раздел показывает текущий статус подписки и доступные планы доступа к расчётам.
                            </Paragraph>
                        </div>

                        <Button
                            icon={<ReloadOutlined />}
                            onClick={loadSubscriptionInfo}
                            loading={subscriptionLoading}
                        >
                            Обновить
                        </Button>
                    </div>

                    <Spin spinning={subscriptionLoading}>
                        <div className="subscriptions-panel">
                            <div className="subscriptions-current">
                                <div className="subscriptions-current-head">
                                    <div>
                                        <Text className="subscriptions-caption">Текущий план</Text>
                                        <div className="subscriptions-current-title">
                                            {subscription?.plan?.title || 'Подписка не оформлена'}
                                        </div>
                                    </div>
                                    <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                                </div>

                                <div className="subscriptions-metrics">
                                    <div className="subscriptions-metric">
                                        <Text className="subscriptions-caption">Период</Text>
                                        <div>{subscription?.plan?.periodMonths ? `${subscription.plan.periodMonths} мес.` : '—'}</div>
                                    </div>
                                    <div className="subscriptions-metric">
                                        <Text className="subscriptions-caption">Начало</Text>
                                        <div>{formatDate(subscription?.startedAt)}</div>
                                    </div>
                                    <div className="subscriptions-metric">
                                        <Text className="subscriptions-caption">Окончание</Text>
                                        <div>{formatDate(subscription?.expiresAt)}</div>
                                    </div>
                                    <div className="subscriptions-metric">
                                        <Text className="subscriptions-caption">Счёт</Text>
                                        <div>{subscription?.invoiceNumber || '—'}</div>
                                    </div>
                                </div>

                                {subscription?.invoiceEmail ? (
                                    <Alert
                                        type="info"
                                        showIcon
                                        message={`Email для счёта: ${subscription.invoiceEmail}`}
                                    />
                                ) : null}

                                <div className="subscriptions-purchase-panel">
                                    <div className="subscriptions-purchase-field">
                                        <Text className="subscriptions-caption">План для покупки</Text>
                                        <div className="subscriptions-purchase-value">
                                            {plans.find((plan) => plan.code === selectedSubscriptionPlanCode)?.title || 'План не выбран'}
                                        </div>
                                    </div>

                                    <div className="subscriptions-purchase-field subscriptions-purchase-field--wide">
                                        <Text className="subscriptions-caption">Email для счёта</Text>
                                        <Input
                                            value={subscriptionInvoiceEmail}
                                            onChange={(event) => setSubscriptionInvoiceEmail(event.target.value)}
                                            prefix={<MailOutlined />}
                                            placeholder="Введите email для выставления счёта"
                                        />
                                    </div>

                                    <div className="subscriptions-purchase-actions">
                                        <Button
                                            onClick={handleCreateSubscriptionInvoice}
                                            loading={subscriptionActionLoading}
                                        >
                                            Выставить счёт
                                        </Button>
                                        <Button
                                            type="primary"
                                            className="sharp-btn"
                                            onClick={handleConfirmSubscriptionPayment}
                                            loading={subscriptionActionLoading}
                                        >
                                            Подтвердить оплату
                                        </Button>
                                    </div>
                                </div>

                                <Alert
                                    type="warning"
                                    showIcon
                                    message="Сценарий оплаты"
                                    description="В текущей реализации раздел позволяет подготовить счёт и вручную подтвердить активацию подписки внутри платформы."
                                />

                                <div className="subscriptions-current-actions">
                                    <Button
                                        type="primary"
                                        className="sharp-btn"
                                        onClick={() => setActiveMenu('projects')}
                                    >
                                        Перейти к проектам
                                    </Button>
                                </div>
                            </div>

                            <div className="subscriptions-catalog">
                                <Title level={4} className="subscriptions-catalog-title">
                                    Доступные планы
                                </Title>

                                <div className="subscriptions-grid">
                                    {plans.map((plan) => {
                                        const isSelected = plan.code === subscription?.selectedPlanCode;

                                        return (
                                            <div
                                                key={plan.code}
                                                className={`subscriptions-plan-card ${isSelected ? 'subscriptions-plan-card--selected' : ''}`}
                                            >
                                                <div className="subscriptions-plan-head">
                                                    <div>
                                                        <div className="subscriptions-plan-title">{plan.title}</div>
                                                        <div className="subscriptions-plan-price">{formatMoney(plan.price)}</div>
                                                    </div>
                                                    {isSelected ? <Tag color="blue">Текущий план</Tag> : null}
                                                </div>

                                                <Paragraph className="subscriptions-plan-description">
                                                    {plan.description || 'Описание плана будет доступно позже.'}
                                                </Paragraph>

                                                <div className="subscriptions-plan-meta">
                                                    <Text type="secondary">
                                                        Срок: {plan.periodMonths ? `${plan.periodMonths} мес.` : '—'}
                                                    </Text>
                                                </div>

                                                <div className="subscriptions-plan-features">
                                                    {(plan.features || []).map((feature) => (
                                                        <div key={feature} className="subscriptions-plan-feature">
                                                            {feature}
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="subscriptions-plan-actions">
                                                    <Button
                                                        type={isSelected ? 'primary' : 'default'}
                                                        onClick={() => setSelectedSubscriptionPlanCode(plan.code)}
                                                    >
                                                        {isSelected ? 'Выбрано' : 'Выбрать план'}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </Spin>
                </Card>
            );
        }

        if (activeMenu === 'video') {
            return (
                <Card className="sharp-card">
                    <Title level={2} className="section-title">Обучающее видео</Title>
                    <Empty description="Видео будут добавлены позже" />
                </Card>
            );
        }

        if (activeMenu === 'email') {
            return (
                <Card className="sharp-card">
                    <Title level={2} className="section-title">Смена Email</Title>

                    <div className="email-placeholder">
                        <div className="email-placeholder-note">
                            <Text className="email-placeholder-label">Текущий email</Text>
                            <div className="email-placeholder-current">
                                {profile?.email || 'Загрузка...'}
                            </div>
                        </div>

                        <Alert
                            type="info"
                            showIcon
                            message="Для смены email нужно подтвердить действие текущим паролем"
                            description="После сохранения новый email сразу отобразится в профиле и будет использоваться для следующих входов."
                        />

                        <Form
                            form={emailForm}
                            layout="vertical"
                            className="email-placeholder-form"
                        >
                            <Form.Item
                                label="Новый email"
                                name="newEmail"
                                rules={[
                                    { required: true, message: 'Введите новый email' },
                                    { type: 'email', message: 'Введите корректный email' },
                                ]}
                            >
                                <Input
                                    className="sharp-input"
                                    placeholder="Введите новый email"
                                    prefix={<MailOutlined />}
                                />
                            </Form.Item>

                            <Form.Item
                                label="Подтверждение email"
                                name="confirmEmail"
                                dependencies={['newEmail']}
                                rules={[
                                    { required: true, message: 'Подтвердите новый email' },
                                    { type: 'email', message: 'Введите корректный email' },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || getFieldValue('newEmail') === value) {
                                                return Promise.resolve();
                                            }
                                            return Promise.reject(new Error('Email не совпадает с новым адресом'));
                                        },
                                    }),
                                ]}
                            >
                                <Input
                                    className="sharp-input"
                                    placeholder="Повторите новый email"
                                    prefix={<MailOutlined />}
                                />
                            </Form.Item>

                            <Form.Item
                                label="Текущий пароль"
                                name="currentPassword"
                                rules={[
                                    { required: true, message: 'Введите текущий пароль' },
                                ]}
                            >
                                <Input.Password
                                    className="sharp-input"
                                    placeholder="Введите текущий пароль"
                                />
                            </Form.Item>

                            <div className="email-placeholder-actions">
                                <Button onClick={() => emailForm.resetFields()}>
                                    Очистить
                                </Button>

                                <Button
                                    type="primary"
                                    className="sharp-btn"
                                    loading={emailSaving}
                                    onClick={handleEmailChange}
                                >
                                    Сохранить новый email
                                </Button>
                            </div>
                        </Form>
                    </div>
                </Card>
            );
        }

        return null;
    };

    return (
        <div className="personal-container">
            <div className={`personal-page-head ${activeMenu === 'projects' ? 'personal-page-head--projects' : ''}`}>
                <div className="personal-page-head__left">
                    <Title level={1} className="page-title">Личный кабинет</Title>
                    <Paragraph className="page-head-subtitle">
                        Управляйте проектами, данными объекта и административными разделами.
                    </Paragraph>
                </div>
            </div>

            <div className={`personal-content ${activeMenu === 'projects' ? 'personal-content--projects' : ''}`}>
                <div className="sidebar sharp-card">
                    <Spin spinning={profileLoading}>
                        <div className="user-info">
                            <Avatar
                                size={80}
                                icon={<UserOutlined />}
                                className="user-avatar"
                                src={bgImage}
                            />
                            <Title level={4} className="user-name">
                                {displayName}
                            </Title>
                            <Text className="user-email">
                                {profile ? profile.email : 'Загрузка...'}
                            </Text>
                            {isAdmin ? (
                                <div className="user-role-badge">ADMIN_ANALYST</div>
                            ) : null}
                        </div>

                        <Divider className="sharp-divider" />

                        <div className="sidebar-menu">
                            {sidebarItems.map((item) => (
                                <div
                                    key={item.key}
                                    className={`sidebar-item ${activeMenu === item.key ? 'active' : ''}`}
                                    onClick={() => handleSidebarClick(item.key)}
                                >
                                    <span className="sidebar-icon">{item.icon}</span>
                                    <span className="sidebar-label">{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </Spin>
                </div>

                <div className={`main-content ${activeMenu === 'projects' ? 'main-content--projects' : ''}`}>
                    {renderMainContent()}
                </div>
            </div>
        </div>
    );
};

export default PersonalAcc;
