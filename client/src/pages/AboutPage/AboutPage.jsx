import React from 'react';
import { Typography, Row, Col, Card, Button, Timeline } from 'antd';
import { Link } from 'react-router-dom';
import {
    AimOutlined,
    DatabaseOutlined,
    EnvironmentOutlined,
    CalculatorOutlined,
    SafetyCertificateOutlined,
    ApartmentOutlined,
    BarChartOutlined,
    FileSearchOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import './AboutPage.css';

const { Title, Paragraph, Text } = Typography;

const AboutPage = () => {
    const principles = [
        {
            icon: <DatabaseOutlined className="about-feature-icon" />,
            title: 'Рыночные данные',
            description:
                'Платформа использует рыночные объявления, кадастровые сведения, пространственные слои и справочники для формирования расчетной базы.',
        },
        {
            icon: <EnvironmentOutlined className="about-feature-icon" />,
            title: 'Пространственный анализ',
            description:
                'Учитываются положение объекта, КАД, территориальные и функциональные зоны, окружение, транспортная доступность и карта Санкт-Петербурга.',
        },
        {
            icon: <CalculatorOutlined className="about-feature-icon" />,
            title: 'Расчет стоимости',
            description:
                'В основе первичной модели лежит доходный подход и метод прямой капитализации с подбором аналогов и расчетом итоговой стоимости.',
        },
        {
            icon: <SafetyCertificateOutlined className="about-feature-icon" />,
            title: 'Прозрачность результата',
            description:
                'Пользователь получает не только итоговую стоимость, но и объяснение расчета: подобранные аналоги, корректировки, сравнение с кадастровой стоимостью.',
        },
    ];

    const audience = [
        'Собственники коммерческих зданий',
        'Представители и управляющие объектами',
        'Аналитики и оценщики',
        'Пользователи, которым нужна предварительная рыночная оценка',
    ];

    const sources = [
        'Рыночные объявления и данные по аренде',
        'НСПД и кадастровые сведения по зданиям и земельным участкам',
        'РГИС Санкт-Петербурга и геослои',
        'Справочники коэффициентов, классов БЦ и статистических показателей',
    ];

    const results = [
        'Сохранение проекта и истории расчетов',
        'Результат оценки по введенному объекту',
        'Подбор аналогов и расчетные параметры',
        'Сравнение с кадастровой стоимостью',
        'Основание для предварительного вывода об оспаривании',
    ];

    return (
        <div className="about-container">
            <section className="about-hero">
                <div className="about-hero-content">
                    <Text className="about-badge">О проекте</Text>
                    <Title level={1} className="about-title">
                        Цифровая платформа
                        экспресс-оценки коммерческих зданий
                    </Title>
                </div>
            </section>

            <section className="about-section">
                <div className="about-section-inner">
                    <Row gutter={[30, 30]} align="stretch">
                        <Col xs={24} lg={14}>
                            <Card className="about-card about-card-large">
                                <div className="about-card-header">
                                    <AimOutlined className="about-card-header-icon" />
                                    <Title level={2} className="about-section-title">
                                        Назначение платформы
                                    </Title>
                                </div>

                                <Paragraph className="about-paragraph">
                                    Платформа ЗЕМА предназначена для экспресс-оценки коммерческих зданий,
                                    прежде всего бизнес-центров и административных зданий, расположенных
                                    в Санкт-Петербурге и пригородах. Пользователь вводит параметры объекта,
                                    получает часть данных автоматически, после чего система подбирает аналоги
                                    и рассчитывает рыночную стоимость.
                                </Paragraph>

                                <Paragraph className="about-paragraph">
                                    В первичной версии фокус сделан на доходном подходе: расчет строится
                                    на рыночной ставке аренды, арендопригодной площади, потерях,
                                    чистом операционном доходе и ставке капитализации.
                                </Paragraph>
                            </Card>
                        </Col>

                        <Col xs={24} lg={10}>
                            <Card className="about-card about-highlight-card">
                                <Title level={3} className="about-mini-title">
                                    Для кого подходит сервис
                                </Title>

                                <div className="about-list">
                                    {audience.map((item, index) => (
                                        <div key={index} className="about-list-item">
                                            <CheckCircleOutlined className="about-list-icon" />
                                            <span>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </Col>
                    </Row>
                </div>
            </section>

            <section className="about-section about-section-muted">
                <div className="about-section-inner">
                    <Title level={2} className="about-block-title centered">
                        Как работает ЗЕМА
                    </Title>

                    <div className="about-timeline-card">
                        <Timeline
                            items={[
                                {
                                    color: '#1890ff',
                                    children: (
                                        <div>
                                            <Text strong className="about-timeline-title">
                                                1. Ввод данных по объекту
                                            </Text>
                                            <Paragraph className="about-timeline-text">
                                                Пользователь создает проект, указывает кадастровые номера,
                                                характеристики здания, параметры этажей, парковки и другие данные.
                                            </Paragraph>
                                        </div>
                                    ),
                                },
                                {
                                    color: '#1890ff',
                                    children: (
                                        <div>
                                            <Text strong className="about-timeline-title">
                                                2. Автозаполнение и проверка сведений
                                            </Text>
                                            <Paragraph className="about-timeline-text">
                                                Система подтягивает доступные кадастровые характеристики,
                                                использует справочники и сохраняет ввод для дальнейшего расчета.
                                            </Paragraph>
                                        </div>
                                    ),
                                },
                                {
                                    color: '#1890ff',
                                    children: (
                                        <div>
                                            <Text strong className="about-timeline-title">
                                                3. Подбор рыночных аналогов
                                            </Text>
                                            <Paragraph className="about-timeline-text">
                                                Аналоги фильтруются по классу БЦ, местоположению, окружению
                                                и другим признакам, после чего отбираются наиболее близкие объекты.
                                            </Paragraph>
                                        </div>
                                    ),
                                },
                                {
                                    color: '#1890ff',
                                    children: (
                                        <div>
                                            <Text strong className="about-timeline-title">
                                                4. Расчет стоимости
                                            </Text>
                                            <Paragraph className="about-timeline-text">
                                                Выполняются корректировки ставок, рассчитываются ПВД, ДВД, ЧОД,
                                                итоговая стоимость и сравнение с кадастровой стоимостью.
                                            </Paragraph>
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    </div>
                </div>
            </section>

            <section className="about-section">
                <div className="about-section-inner">
                    <Title level={2} className="about-block-title centered">
                        Ключевые возможности платформы
                    </Title>

                    <Row gutter={[30, 30]}>
                        {principles.map((item, index) => (
                            <Col xs={24} sm={12} lg={6} key={index}>
                                <Card className="about-card about-feature-card">
                                    <div className="about-feature-icon-wrap">{item.icon}</div>
                                    <Title level={3} className="about-feature-title">
                                        {item.title}
                                    </Title>
                                    <Paragraph className="about-feature-description">
                                        {item.description}
                                    </Paragraph>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </div>
            </section>

            <section className="about-section about-section-muted">
                <div className="about-section-inner">
                    <Row gutter={[30, 30]}>
                        <Col xs={24} lg={12}>
                            <Card className="about-card about-info-card">
                                <div className="about-card-header">
                                    <ApartmentOutlined className="about-card-header-icon" />
                                    <Title level={3} className="about-mini-title">
                                        Какие данные используются
                                    </Title>
                                </div>

                                <div className="about-list">
                                    {sources.map((item, index) => (
                                        <div key={index} className="about-list-item">
                                            <DatabaseOutlined className="about-list-icon" />
                                            <span>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </Col>

                        <Col xs={24} lg={12}>
                            <Card className="about-card about-info-card">
                                <div className="about-card-header">
                                    <FileSearchOutlined className="about-card-header-icon" />
                                    <Title level={3} className="about-mini-title">
                                        Что получает пользователь
                                    </Title>
                                </div>

                                <div className="about-list">
                                    {results.map((item, index) => (
                                        <div key={index} className="about-list-item">
                                            <BarChartOutlined className="about-list-icon" />
                                            <span>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </Col>
                    </Row>
                </div>
            </section>

            <section className="about-section">
                <div className="about-section-inner">
                    <Card className="about-card about-closing-card">
                        <Title level={2} className="about-block-title">
                            Почему это удобно
                        </Title>

                        <Paragraph className="about-paragraph">
                            ЗЕМА объединяет в одном интерфейсе ввод данных, аналитику, карту,
                            работу со справочниками и расчет стоимости объекта. Это снижает объем
                            ручной подготовки, ускоряет первичный анализ и делает результат понятным
                            для пользователя.
                        </Paragraph>

                        <Paragraph className="about-paragraph">
                            Платформа подходит как для быстрой предварительной оценки, так и для
                            дальнейшего развития в сторону полноценной аналитической системы по рынку
                            коммерческой недвижимости Санкт-Петербурга.
                        </Paragraph>

                        <div className="about-bottom-actions">
                            <Link to="/login">
                                <Button type="primary" size="large" className="about-primary-btn">
                                    Перейти к расчету
                                </Button>
                            </Link>
                            <Link to="/services">
                                <Button size="large" className="about-secondary-btn">
                                    Посмотреть услуги
                                </Button>
                            </Link>
                        </div>
                    </Card>
                </div>
            </section>
        </div>
    );
};

export default AboutPage;