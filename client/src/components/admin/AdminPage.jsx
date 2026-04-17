import React, { useMemo, useState } from 'react';
import { Card, Segmented, Space, Tabs, Tag, Typography } from 'antd';
import {
    AuditOutlined,
    CreditCardOutlined,
    DatabaseOutlined,
    FundOutlined,
    ProjectOutlined,
    TeamOutlined,
    ApartmentOutlined,
    BranchesOutlined,
} from '@ant-design/icons';
import AdminOverview from './AdminOverview';
import AdminUsersTable from './AdminUsersTable';
import AdminProjectsTable from './AdminProjectsTable';
import AdminCadastralTable from './AdminCadastralTable';
import AdminAuditTable from './AdminAuditTable';
import AdminMarketOffersTable from './AdminMarketOffersTable';
import AdminSpatialZonesTab from './AdminSpatialZonesTab';
import AdminAnaloguesTable from './AdminAnaloguesTable';
import AdminBillingTab from './AdminBillingTab';
import './AdminPage.css';

const { Title, Paragraph, Text } = Typography;

const ADMIN_CATEGORIES = [
    {
        key: 'monitoring',
        label: 'Мониторинг',
        title: 'Мониторинг и контроль',
        description: 'Обзор состояния системы, контроль действий и быстрый аудит происходящего в платформе.',
        icon: <FundOutlined />,
        tabs: [
            {
                key: 'overview',
                label: 'Обзор',
                description: 'Главные метрики и текущее состояние системы.',
                content: <AdminOverview />,
            },
            {
                key: 'audit',
                label: 'Аудит',
                description: 'Журнал действий администраторов и важных операций.',
                content: <AdminAuditTable />,
            },
        ],
    },
    {
        key: 'operations',
        label: 'Операции',
        title: 'Операционное администрирование',
        description: 'Управление пользователями, проектами и коммерческими условиями доступа к расчётам.',
        icon: <ProjectOutlined />,
        tabs: [
            {
                key: 'projects',
                label: 'Проекты',
                description: 'Управление проектами пользователей и их статусами.',
                content: <AdminProjectsTable />,
            },
            {
                key: 'users',
                label: 'Пользователи',
                description: 'Доступы, роли и параметры работы пользователей.',
                content: <AdminUsersTable />,
            },
            {
                key: 'billing',
                label: 'Оплата и подписки',
                description: 'Тарифы, планы подписки и администрирование пользовательских подписок.',
                content: <AdminBillingTab />,
            },
        ],
    },
    {
        key: 'data',
        label: 'Данные',
        title: 'Источники и справочники',
        description: 'Работа с данными, на которых строятся расчёты: кадастр, рынок, аналоги и пространственные зоны.',
        icon: <DatabaseOutlined />,
        tabs: [
            {
                key: 'cadastral',
                label: 'Кадастровые данные',
                description: 'Проверка и редактирование кадастрового слоя.',
                content: <AdminCadastralTable />,
            },
            {
                key: 'market-offers',
                label: 'Рыночная база',
                description: 'Рыночные офферы, окружение и связанная аналитика.',
                content: <AdminMarketOffersTable />,
            },
            {
                key: 'analogues',
                label: 'Аналоги',
                description: 'База аналогов для расчётов и контроля качества выборки.',
                content: <AdminAnaloguesTable />,
            },
            {
                key: 'spatial-zones',
                label: 'Полигоны',
                description: 'Пространственные зоны, используемые в логике расчёта.',
                content: <AdminSpatialZonesTab />,
            },
        ],
    },
];

export default function AdminPage() {
    const [categoryKey, setCategoryKey] = useState('monitoring');
    const [tab, setTab] = useState('overview');

    const activeCategory = useMemo(
        () => ADMIN_CATEGORIES.find((item) => item.key === categoryKey) || ADMIN_CATEGORIES[0],
        [categoryKey]
    );

    const activeCategoryTabs = activeCategory.tabs;

    const categoryOptions = ADMIN_CATEGORIES.map((category) => ({
        label: (
            <span className="admin-page-category-option">
                {category.icon}
                <span>{category.label}</span>
            </span>
        ),
        value: category.key,
    }));

    const handleCategoryChange = (nextCategoryKey) => {
        const nextCategory = ADMIN_CATEGORIES.find((item) => item.key === nextCategoryKey);
        setCategoryKey(nextCategoryKey);
        setTab(nextCategory?.tabs?.[0]?.key || 'overview');
    };

    const tabItems = activeCategoryTabs.map((item) => ({
        key: item.key,
        label: item.label,
        children: (
            <div className="admin-page-section-shell">
                <div className="admin-page-section-head">
                    <Text className="admin-page-section-title">{item.label}</Text>
                    <Text type="secondary">{item.description}</Text>
                </div>
                <div className="admin-page-section-content">
                    {item.content}
                </div>
            </div>
        ),
    }));

    return (
        <div className="admin-page-shell">
            <Card className="sharp-card admin-page-hero">
                <div className="admin-page-hero-top">
                    <div>
                        <Title level={2} className="admin-page-title">
                            Администрирование платформы
                        </Title>
                    </div>
                </div>

                <Segmented
                    block
                    value={categoryKey}
                    options={categoryOptions}
                    onChange={handleCategoryChange}
                    className="admin-page-category-switch"
                />
            </Card>

            <Card className="sharp-card admin-page-category-card">
                <Space direction="vertical" size={18} style={{ width: '100%' }}>
                    <div className="admin-page-category-head">
                        <div className="admin-page-category-title-wrap">
                            <span className="admin-page-category-icon">{activeCategory.icon}</span>
                            <div>
                                <Title level={3} className="admin-page-category-title">
                                    {activeCategory.title}
                                </Title>
                                <Paragraph className="admin-page-category-description">
                                    {activeCategory.description}
                                </Paragraph>
                            </div>
                        </div>

                        <Space wrap className="admin-page-category-tags">
                            {activeCategory.tabs.map((item) => {
                                const icon = item.key === 'projects'
                                    ? <ProjectOutlined />
                                    : item.key === 'users'
                                        ? <TeamOutlined />
                                        : item.key === 'billing'
                                            ? <CreditCardOutlined />
                                            : item.key === 'cadastral'
                                                ? <DatabaseOutlined />
                                                : item.key === 'market-offers'
                                                    ? <FundOutlined />
                                                    : item.key === 'analogues'
                                                        ? <BranchesOutlined />
                                                        : item.key === 'spatial-zones'
                                                            ? <ApartmentOutlined />
                                                            : <AuditOutlined />;

                                return (
                                    <Tag key={item.key} icon={icon} color={tab === item.key ? 'blue' : 'default'}>
                                        {item.label}
                                    </Tag>
                                );
                            })}
                        </Space>
                    </div>

                    <Tabs
                        activeKey={tab}
                        onChange={setTab}
                        items={tabItems}
                        className="admin-page-tabs"
                    />
                </Space>
            </Card>
        </div>
    );
}
