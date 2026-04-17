import React from 'react';
import { Typography, Row, Col, Card, Button, Form, Input } from 'antd';
import { Link } from 'react-router-dom';
import {
    MailOutlined,
    PhoneOutlined,
    EnvironmentOutlined,
    ClockCircleOutlined,
    SendOutlined,
} from '@ant-design/icons';
import './ContactsPage.css';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

const ContactsPage = () => {
    return (
        <div className="contacts-page-container">
            <section className="contacts-page-hero">
                <div className="contacts-page-hero-content">
                    <Text className="contacts-page-badge">Контакты</Text>
                    <Title level={1} className="contacts-page-title">
                        Свяжитесь с командой
                        <br />
                        платформы ЗЕМА
                    </Title>
                </div>
            </section>

            <section className="contacts-page-section">
                <div className="contacts-page-inner">
                    <Row gutter={[30, 30]} align="stretch">
                        <Col xs={24} lg={10}>
                            <Card className="contacts-page-card contacts-page-info-card">
                                <Title level={2} className="contacts-page-section-title">
                                    Контактная информация
                                </Title>

                                <div className="contacts-page-info-list">
                                    <div className="contacts-page-info-item">
                                        <MailOutlined className="contacts-page-info-icon" />
                                        <div>
                                            <Text className="contacts-page-info-label">Email</Text>
                                            <Paragraph className="contacts-page-info-value">
                                                Voronova.anastasiya99@yandex.ru
                                            </Paragraph>
                                        </div>
                                    </div>

                                    <div className="contacts-page-info-item">
                                        <PhoneOutlined className="contacts-page-info-icon" />
                                        <div>
                                            <Text className="contacts-page-info-label">Телефон</Text>
                                            <Paragraph className="contacts-page-info-value">
                                                +7 (931) 986-57-16
                                            </Paragraph>
                                        </div>
                                    </div>

                                    <div className="contacts-page-info-item">
                                        <EnvironmentOutlined className="contacts-page-info-icon" />
                                        <div>
                                            <Text className="contacts-page-info-label">Город</Text>
                                            <Paragraph className="contacts-page-info-value">
                                                Санкт-Петербург
                                            </Paragraph>
                                        </div>
                                    </div>

                                    <div className="contacts-page-info-item">
                                        <ClockCircleOutlined className="contacts-page-info-icon" />
                                        <div>
                                            <Text className="contacts-page-info-label">Режим работы</Text>
                                            <Paragraph className="contacts-page-info-value">
                                                Пн–Пт, 10:00–18:00
                                            </Paragraph>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Col>

                        <Col xs={24} lg={14}>
                            <Card className="contacts-page-card contacts-page-form-card">
                                <Title level={2} className="contacts-page-section-title">
                                    Напишите нам
                                </Title>

                                <Paragraph className="contacts-page-form-description">
                                    Оставьте сообщение, и мы свяжемся с вами по вопросам оценки,
                                    аналитики, доступа к платформе или демонстрации сервиса.
                                </Paragraph>

                                <Form layout="vertical" className="contacts-page-form">
                                    <Row gutter={20}>
                                        <Col xs={24} md={12}>
                                            <Form.Item label="Ваше имя" name="name">
                                                <Input
                                                    size="large"
                                                    placeholder="Введите имя"
                                                    className="contacts-page-input"
                                                />
                                            </Form.Item>
                                        </Col>

                                        <Col xs={24} md={12}>
                                            <Form.Item label="Email" name="email">
                                                <Input
                                                    size="large"
                                                    placeholder="Введите email"
                                                    className="contacts-page-input"
                                                />
                                            </Form.Item>
                                        </Col>
                                    </Row>

                                    <Row gutter={20}>
                                        <Col xs={24} md={12}>
                                            <Form.Item label="Телефон" name="phone">
                                                <Input
                                                    size="large"
                                                    placeholder="Введите телефон"
                                                    className="contacts-page-input"
                                                />
                                            </Form.Item>
                                        </Col>

                                        <Col xs={24} md={12}>
                                            <Form.Item label="Тема" name="subject">
                                                <Input
                                                    size="large"
                                                    placeholder="Тема обращения"
                                                    className="contacts-page-input"
                                                />
                                            </Form.Item>
                                        </Col>
                                    </Row>

                                    <Form.Item label="Сообщение" name="message">
                                        <TextArea
                                            rows={6}
                                            placeholder="Опишите ваш вопрос"
                                            className="contacts-page-textarea"
                                        />
                                    </Form.Item>

                                    <div className="contacts-page-form-actions">
                                        <Button
                                            type="primary"
                                            size="large"
                                            icon={<SendOutlined />}
                                            className="contacts-page-primary-btn"
                                        >
                                            Отправить сообщение
                                        </Button>

                                        <Link to="/login">
                                            <Button size="large" className="contacts-page-secondary-btn">
                                                Перейти к оценке
                                            </Button>
                                        </Link>
                                    </div>
                                </Form>
                            </Card>
                        </Col>
                    </Row>
                </div>
            </section>

            <section className="contacts-page-section contacts-page-section-muted">
                <div className="contacts-page-inner">
                    <Row gutter={[30, 30]}>
                        <Col xs={24} md={8}>
                            <Card className="contacts-page-card contacts-page-small-card">
                                <Title level={3} className="contacts-page-small-title">
                                    По платформе
                                </Title>
                                <Paragraph className="contacts-page-small-text">
                                    Вопросы по интерфейсу, доступу, разделам проекта и регистрации пользователей.
                                </Paragraph>
                            </Card>
                        </Col>

                        <Col xs={24} md={8}>
                            <Card className="contacts-page-card contacts-page-small-card">
                                <Title level={3} className="contacts-page-small-title">
                                    По аналитике
                                </Title>
                                <Paragraph className="contacts-page-small-text">
                                    Вопросы по выборкам, аналогам, картам, рыночным данным и формированию выводов.
                                </Paragraph>
                            </Card>
                        </Col>

                        <Col xs={24} md={8}>
                            <Card className="contacts-page-card contacts-page-small-card">
                                <Title level={3} className="contacts-page-small-title">
                                    По оценке
                                </Title>
                                <Paragraph className="contacts-page-small-text">
                                    Вопросы по логике расчета, параметрам объекта, результату оценки и интерпретации.
                                </Paragraph>
                            </Card>
                        </Col>
                    </Row>
                </div>
            </section>
        </div>
    );
};

export default ContactsPage;