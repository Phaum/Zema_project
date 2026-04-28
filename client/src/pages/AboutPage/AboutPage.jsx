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
        'Собственники коммерческой недвижимости',
        'Оценочные компании',
    ];

    const sources = [
        'База объявлений по аренде коммерческих помещений',
        'Сведения из государственных реестров (ЕГРН, РГИС)',
        'Данные OpenStreetMap',
        'Статистические показатели, выведенные аналитиками «СтатРиелт»',
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
                        экспресс-оценки коммерческой недвижимости
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

                                <Title level={3} className="about-purpose-title">
                                    Как мы работаем и в чём ваша выгода
                                </Title>

                                <Paragraph className="about-paragraph">
                                    Платформа «ЗЕМА» предоставляет собственникам недвижимости быструю и объективную аналитику рыночной стоимости объекта.
                                </Paragraph>

                                <Paragraph className="about-paragraph">
                                    В отличие от полноценного отчёта, мы готовим предварительное заключение. Это позволяет вам уже на первом этапе:
                                </Paragraph>

                                <ul className="about-purpose-list">
                                    <li>
                                        <Text strong className="about-purpose-accent">Понять разницу:</Text>
                                        <span> увидеть, насколько кадастровая стоимость отличается от рыночной.</span>
                                    </li>
                                    <li>
                                        <Text strong className="about-purpose-accent">Оценить перспективы:</Text>
                                        <span> решить, есть ли экономический смысл начинать процедуру оспаривания.</span>
                                    </li>
                                    <li>
                                        <Text strong className="about-purpose-accent">Сэкономить ресурсы:</Text>
                                        <span> не тратить время и деньги на глубокий анализ без необходимости.</span>
                                    </li>
                                </ul>

                                <Title level={3} className="about-purpose-title about-purpose-title-spaced">
                                    С «ЗЕМА» вы:
                                </Title>

                                <ul className="about-purpose-list">
                                    <li>
                                        <Text strong className="about-purpose-accent">Экономите деньги:</Text>
                                        <span> избегаете лишних трат на тот случай, если кадастровая стоимость соответствует рынку.</span>
                                    </li>
                                    <li>
                                        <Text strong className="about-purpose-accent">Экономите время:</Text>
                                        <span> заключение формируется в кратчайшие сроки.</span>
                                    </li>
                                    <li>
                                        <Text strong className="about-purpose-accent">Получаете ясность:</Text>
                                        <span> сразу видите потенциал для снижения налоговой нагрузки.</span>
                                    </li>
                                    <li>
                                        <Text strong className="about-purpose-accent">Принимаете обоснованные решения:</Text>
                                        <span> понимаете, стоит ли двигаться дальше.</span>
                                    </li>
                                </ul>

                                <Paragraph className="about-paragraph about-purpose-closing">
                                    Мы делаем первый шаг к защите ваших имущественных интересов простым, быстрым и прозрачным.
                                </Paragraph>
                            </Card>
                        </Col>

                        <Col xs={24} lg={10}>
                            <Card className="about-card about-highlight-card">
                                <Title level={3} className="about-mini-title">
                                    Для кого подходит сервис
                                </Title>

                                {/* Новый блок с hover-эффектом */}
                                <div className="about-audience-hover-list">
                                    {audience.map((item, index) => (
                                        <div key={index} className="about-audience-item">
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
                                                Вы создаёте новый проект и указываете базовые параметры: кадастровый номер, арендопригодную площадь и площадь, занятую арендаторами. Это занимает всего пару минут.
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
                                                Платформа автоматически подтягивает характеристики объекта из официальных государственных реестров (ЕГРН, РГИС). Система также анализирует местоположение объекта, чтобы учесть все ключевые факторы, влияющие на стоимость.
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
                                                На основе введённых данных «ЗЕМА» подбирает наиболее сопоставимые объекты-аналоги. Фильтрация идёт по классу недвижимости, локации, окружению и другим важным признакам, чтобы сравнение было максимально корректным.
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
                                                Система определяет среднюю рыночную арендную ставку для вашего объекта. На её основе, используя доходный подход, платформа рассчитывает итоговую рыночную стоимость и формирует вероятный диапазон значений.
                                            </Paragraph>
                                        </div>
                                    ),
                                },

                                {
                                    color: '#1890ff',
                                    children: (
                                        <div>
                                            <Text strong className="about-timeline-title">
                                                5. Оценка потенциала оспаривания
                                            </Text>
                                            <Paragraph className="about-timeline-text">
                                                В результате вы получаете не только расчёт рыночной стоимости, но и наглядный показатель — процент отклонения от действующей кадастровой стоимости. Это позволяет быстро понять, есть ли экономический смысл инициировать процедуру оспаривания.
                                            </Paragraph>
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    </div>
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
                            коммерческой недвижимости.
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
