import React from 'react';
import { Card, Button, Typography, Row, Col } from 'antd';
import { DownloadOutlined, FileTextOutlined, CalculatorOutlined, VideoCameraOutlined } from '@ant-design/icons';
import './ServicesPage.css';

const { Title, Paragraph } = Typography;

const ServicesPage = () => {
  const services = [
    {
      icon: <FileTextOutlined className="service-icon" />,
      title: "Образец заключения ЗЕМА",
      description: "Пример отчета об оценке коммерческого здания.",
      buttonText: "Скачать PDF",
      buttonIcon: <DownloadOutlined />
    },
    {
      icon: <CalculatorOutlined className="service-icon" />,
      title: "Рыночная экспресс-оценка",
      description: "Быстрая оценка стоимости",
      buttonText: "Заполнить анкету",
      buttonIcon: null
    },
    {
      icon: <VideoCameraOutlined className="service-icon" />,
      title: "Обучающее видео",
      description: "Инструкции по заполнению опросника",
      buttonText: "Смотреть",
      buttonIcon: null
    }
  ];

  return (
    <div className="services-container">
      <div className="services-hero">
        <div className="services-hero-content">
          <Title level={1} className="page-title">Услуги</Title>
        </div>
      </div>

      <div className="services-main">
        <div className="services-section">
          <Row gutter={[30, 30]} justify="center">
            {services.map((service, index) => (
              <Col xs={24} md={8} key={index}>
                <Card className="service-card sharp-card">
                  <div className="service-card-inner">
                    <div className="service-icon-wrapper">
                      {service.icon}
                    </div>
                    <Title level={3} className="service-title">
                      {service.title}
                    </Title>
                    <Paragraph className="service-description">
                      {service.description}
                    </Paragraph>
                    <Button 
                      type="primary" 
                      icon={service.buttonIcon}
                      className="sharp-btn service-btn"
                    >
                      {service.buttonText}
                    </Button>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>
    </div>
  );
};

export default ServicesPage;