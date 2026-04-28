import React, { useState } from 'react';
import { Card, Button, Typography, Row, Col, message } from 'antd';
import { DownloadOutlined, FileTextOutlined, CalculatorOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom'; // добавляем хук навигации
import './ServicesPage.css';

const { Title, Paragraph } = Typography;

const ServicesPage = () => {
  const navigate = useNavigate(); // инициализируем навигацию
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadSample = async () => {
    setDownloadingPdf(true);
    try {
      const fileUrl = '/samples/zema-report-sample.pdf';
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Файл не найден');
      const blob = await response.blob();
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = 'Образец_заключения_ЗЕМА.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      message.success('Скачивание началось');
    } catch (error) {
      console.error(error);
      message.error('Не удалось загрузить файл. Попробуйте позже.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const services = [
    {
      icon: <FileTextOutlined className="service-icon" />,
      title: "Образец заключения ЗЕМА",
      description: "Пример рыночной оценки бизнес-центра класса В+",
      buttonText: "Скачать PDF",
      buttonIcon: <DownloadOutlined />,
      onClick: handleDownloadSample,
      loading: downloadingPdf,
    },
    {
      icon: <CalculatorOutlined className="service-icon" />,
      title: "Рыночная экспресс-оценка",
      description: "Заполните анкету для быстрого расчёта", // опционально
      buttonText: "Заполнить анкету",
      buttonIcon: null,
      onClick: () => navigate('/login'), // переход на страницу входа/анкеты
      loading: false,
    },
    {
      icon: <VideoCameraOutlined className="service-icon" />,
      title: "Обучающее видео",
      description: "Инструкции по заполнению опросника",
      buttonText: "Смотреть",
      buttonIcon: null,
      onClick: () => {
        message.info('Видео будет доступно позже');
      },
      loading: false,
    },
  ];

  return (
    <div className="services-page-container">
      <section className="services-page-hero">
        <div className="services-page-hero-content">
          <Title className="services-page-badge">Услуги</Title>
          <Title level={1} className="services-page-title">
            <br />
          </Title>
        </div>
      </section>

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
                      loading={service.loading}
                      onClick={service.onClick}
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
