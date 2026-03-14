import React from 'react';
import { Button, Typography, Row, Col } from 'antd';
import { Link } from 'react-router-dom';
import { 
  DatabaseOutlined, 
  SearchOutlined, 
  CalculatorOutlined 
} from '@ant-design/icons';
import './HomePage.css';

const { Title, Paragraph, Text } = Typography;

const HomePage = () => {
  const analyticsExamples = [
    "Тепловая карта: Удельная стоимость аренды офисных помещений по районам Санкт-Петербурга",
    "Как изменился спрос на арендопригодные площади после 2024 года: анализ данных Росреестра по сделкам",
    "Сравнительный анализ кадастровой и расчетной рыночной стоимости зданий в историческом центре Санкт-Петербурга",
    "Рейтинг районов СПб по инвестиционной привлекательности коммерческой недвижимости в 2025 году"
  ];

  const features = [
    {
      icon: <DatabaseOutlined className="feature-icon" />,
      title: "Сбор данных"
    },
    {
      icon: <SearchOutlined className="feature-icon" />,
      title: "Подбор аналогов"
    },
    {
      icon: <CalculatorOutlined className="feature-icon" />,
      title: "Рыночная оценка"
    }
  ];

  return (
    <div className="home-container">
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-text">
            <Title level={1} className="hero-subtitle">ЗЕМА — ОЦЕНКА БИЗНЕС-ЦЕНТРОВ СПБ</Title>
            <Paragraph className="hero-description">
              Быстрая рыночная оценка коммерческих зданий
            </Paragraph>
            <Link to="/login">
              <Button type="primary" size="large" className="cta-button">
                Рассчитать стоимость
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="section-container">
          <Row gutter={[40, 40]} justify="center">
            {features.map((feature, index) => (
              <Col xs={24} md={8} key={index}>
                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    {feature.icon}
                  </div>
                  <Title level={3} className="feature-title">
                    {feature.title}
                  </Title>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      <div className="divider"></div>

      <section className="analytics-section">
        <div className="section-container">
          <Title level={2} className="section-title">Примеры аналитики</Title>
          <div className="analytics-list">
            {analyticsExamples.map((item, index) => (
              <div key={index} className="analytics-item">
                <blockquote className="analytics-quote">
                  <Text strong className="quote-marker">&gt; </Text>
                  <Text className="quote-text">{item}</Text>
                </blockquote>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="divider"></div>

      <section className="cta-section">
        <div className="section-container">
          <div className="cta-content">
            <Paragraph className="cta-text">
              Заполните анкету — получите расчет стоимости за 5 минут.
            </Paragraph>
            <Link to="/questionary">
              <Button type="primary" size="large" className="cta-button-bottom">
                Начать оценку
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;