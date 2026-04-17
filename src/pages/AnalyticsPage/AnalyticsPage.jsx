import React from 'react';
import { Typography, Row, Col, Card, Button, Tag } from 'antd';
import { Link } from 'react-router-dom';
import {
    HeatMapOutlined,
    BarChartOutlined,
    EnvironmentOutlined,
    ApartmentOutlined,
    RiseOutlined,
    DatabaseOutlined,
    SearchOutlined,
    FundProjectionScreenOutlined,
} from '@ant-design/icons';
import './AnalyticsPage.css';

const { Title, Paragraph, Text } = Typography;

const AnalyticsPage = () => {
    const analyticsCards = [
        {
            icon: <HeatMapOutlined className="analytics-page-icon" />,
            title: 'Тепловые карты',
            description:
                'Визуализация удельной стоимости аренды и стоимости объектов по районам и зонам Санкт-Петербурга.',
            tags: ['карта', 'геоаналитика', 'районы'],
        },
        {
            icon: <BarChartOutlined className="analytics-page-icon" />,
            title: 'Сравнение аналогов',
            description:
                'Подбор и анализ рыночных аналогов с возможностью сравнения ставок, площадей, местоположения и класса объекта.',
            tags: ['аналоги', 'рынок', 'сравнение'],
        },
        {
            icon: <ApartmentOutlined className="analytics-page-icon" />,
            title: 'Аналитика по сегментам',
            description:
                'Отдельные выборки и обзоры по бизнес-центрам, административным зданиям и другим типам коммерческой недвижимости.',
            tags: ['сегменты', 'объекты', 'обзор'],
        },
        {
            icon: <RiseOutlined className="analytics-page-icon" />,
            title: 'Динамика рынка',
            description:
                'Отслеживание изменений ставок аренды, капитализации и ключевых параметров рынка по периодам.',
            tags: ['динамика', 'тренды', 'рынок'],
        },
    ];

    const exampleReports = [
        'Тепловая карта арендных ставок офисных помещений по районам Санкт-Петербурга',
        'Сравнение кадастровой и расчетной рыночной стоимости коммерческих объектов',
        'Подбор наиболее релевантных аналогов для заданного объекта',
        'Анализ инвестиционной привлекательности районов СПб',
        'Сводка по объектам, у которых есть потенциал для снижения кадастровой нагрузки',
        'Срез рынка по классам бизнес-центров и диапазонам арендных ставок',
    ];

    const dataSources = [
        {
            icon: <DatabaseOutlined className="analytics-source-icon" />,
            title: 'Рыночные данные',
            text: 'Объявления, арендные ставки, характеристики аналогов и сопоставимые предложения.',
        },
        {
            icon: <EnvironmentOutlined className="analytics-source-icon" />,
            title: 'Пространственные слои',
            text: 'Локация объекта, район, транспортная доступность, окружение и геопривязка.',
        },
        {
            icon: <SearchOutlined className="analytics-source-icon" />,
            title: 'Кадастровые сведения',
            text: 'Данные по зданиям, участкам, площадям и связанным объектам недвижимости.',
        },
    ];

    return (
        <div className="analytics-page-container">
            <section className="analytics-page-hero">
                <div className="analytics-page-hero-content">
                    <Text className="analytics-page-badge">Аналитика</Text>
                    <Title level={1} className="analytics-page-title">
                        Рыночные данные,
                        <br />
                        карты и сравнение объектов
                    </Title>
                </div>
            </section>

            <section className="analytics-page-section">
                <div className="analytics-page-inner">
                    <Title level={2} className="analytics-page-section-title centered">
                        Что доступно в аналитике
                    </Title>

                    <Row gutter={[30, 30]}>
                        {analyticsCards.map((item, index) => (
                            <Col xs={24} sm={12} lg={6} key={index}>
                                <Card className="analytics-page-card analytics-page-feature-card">
                                    <div className="analytics-page-icon-wrap">{item.icon}</div>
                                    <Title level={3} className="analytics-page-card-title">
                                        {item.title}
                                    </Title>
                                    <Paragraph className="analytics-page-card-description">
                                        {item.description}
                                    </Paragraph>

                                    <div className="analytics-page-tags">
                                        {item.tags.map((tag) => (
                                            <Tag key={tag} className="analytics-page-tag">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </div>
            </section>

            <section className="analytics-page-section analytics-page-section-muted">
                <div className="analytics-page-inner">
                    <Row gutter={[30, 30]} align="stretch">
                        <Col xs={24} lg={13}>
                            <Card className="analytics-page-card analytics-page-large-card">
                                <div className="analytics-page-header-line">
                                    <FundProjectionScreenOutlined className="analytics-page-header-icon" />
                                    <Title level={2} className="analytics-page-section-title">
                                        Примеры аналитических материалов
                                    </Title>
                                </div>

                                <div className="analytics-page-report-list">
                                    {exampleReports.map((item, index) => (
                                        <div key={index} className="analytics-page-report-item">
                                            <Text className="analytics-page-report-marker">{'>'}</Text>
                                            <Text className="analytics-page-report-text">{item}</Text>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </Col>

                        <Col xs={24} lg={11}>
                            <Card className="analytics-page-card analytics-page-side-card">
                                <Title level={3} className="analytics-page-side-title">
                                    Для чего нужен раздел
                                </Title>

                                <Paragraph className="analytics-page-paragraph">
                                    Аналитика нужна не только для просмотра цифр, но и для понимания рынка:
                                    где находятся сильные локации, какие объекты ближе к вашему кейсу,
                                    как отличаются ставки и какие параметры сильнее всего влияют на стоимость.
                                </Paragraph>

                                <Paragraph className="analytics-page-paragraph">
                                    Такой раздел особенно полезен при предварительной оценке,
                                    подготовке к переговорам, внутреннем анализе портфеля
                                    и сравнении объекта с рынком.
                                </Paragraph>
                            </Card>
                        </Col>
                    </Row>
                </div>
            </section>

            <section className="analytics-page-section">
                <div className="analytics-page-inner">
                    <Title level={2} className="analytics-page-section-title centered">
                        Источники данных
                    </Title>

                    <Row gutter={[30, 30]}>
                        {dataSources.map((item, index) => (
                            <Col xs={24} md={8} key={index}>
                                <Card className="analytics-page-card analytics-page-source-card">
                                    <div className="analytics-page-source-top">
                                        {item.icon}
                                        <Title level={3} className="analytics-page-card-title">
                                            {item.title}
                                        </Title>
                                    </div>
                                    <Paragraph className="analytics-page-card-description">
                                        {item.text}
                                    </Paragraph>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </div>
            </section>

            <section className="analytics-page-section analytics-page-bottom-cta">
                <div className="analytics-page-inner">
                    <div className="analytics-page-cta-box">
                        <Title level={2} className="analytics-page-cta-title">
                            Начните с оценки объекта
                        </Title>
                        <Paragraph className="analytics-page-cta-text">
                            Аналитика работает лучше всего вместе с расчетом:
                            сначала введите объект, затем сравните его с рынком и аналогами.
                        </Paragraph>

                        <div className="analytics-page-actions centered-actions">
                            <Link to="/login">
                                <Button type="primary" size="large" className="analytics-page-primary-btn">
                                    Начать расчет
                                </Button>
                            </Link>

                            <Link to="/contacts">
                                <Button size="large" className="analytics-page-secondary-btn">
                                    Связаться с нами
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default AnalyticsPage;