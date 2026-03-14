import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Card, 
  Button, 
  Typography, 
  Divider, 
  Tabs, 
  Input, 
  Table,
  Avatar,
  Row,
  Col,
  Empty
} from 'antd';
import { 
  UserOutlined, 
  MailOutlined, 
  VideoCameraOutlined, 
  LogoutOutlined,
  EditOutlined,
  FileSearchOutlined
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import './PersonalAcc.css';
import bgImage from '../../images/zema_background.jpg';

const { Title, Paragraph, Text } = Typography;
const { TabPane } = Tabs;

const API = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const PersonalAcc = () => {
  const [activeTab, setActiveTab] = useState('active');
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data } = await axios.get(`${API}/profile`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setProfile(data);
      } catch (err) {
        console.error('Не удалось загрузить профиль', err);
      }
    }
    loadProfile();
  }, []);

  
  const sidebarItems = [
    { key: 'projects', icon: <FileSearchOutlined />, label: 'Мои проекты' },
    { key: 'wizard', icon: <EditOutlined />, label: 'Настройки' },
    { key: 'video', icon: <VideoCameraOutlined />, label: 'Обучающее видео' },
    { key: 'email', icon: <MailOutlined />, label: 'Смена Email' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Выход' },
  ];

  const emptyState = {
    emptyText: 'Пока нет проектов'
  };

  return (
    <div className="personal-container">
      <div className="personal-hero">
        <div className="personal-hero-content">
          <Title level={1} className="page-title">Личный кабинет</Title>
        </div>
      </div>

      <div className="personal-content">
        <div className="sidebar sharp-card">
          <div className="user-info">
            <Avatar 
              size={80} 
              icon={<UserOutlined />} 
              className="user-avatar"
              src={bgImage}
            />
            <Title level={4} className="user-name">
              {profile ? profile.login : 'Загрузка...'}
            </Title>
            <Text className="user-email">
              {profile ? profile.email : 'Загрузка...'}
            </Text>
          </div>

          <Divider className="sharp-divider" />

          <div className="sidebar-menu">
            {sidebarItems.map((item) => (
              <div 
                key={item.key}
                className={`sidebar-item ${activeTab === item.key ? 'active' : ''}`}
                onClick={() => setActiveTab(item.key)}
              >
                <span className="sidebar-icon">{item.icon}</span>
                <span className="sidebar-label">{item.label}</span>
              </div>
            ))}
          </div>

          <Divider className="sharp-divider" />

          <div className="sidebar-cta">
            <Paragraph className="cta-text">
              Заполните анкету — получите расчет стоимости за 5 минут.
            </Paragraph>
            <Link to="/questionary">
              <Button type="primary" className="sharp-btn cta-btn">
                Заполнить анкету
              </Button>
            </Link>
          </div>
        </div>

        <div className="main-content">
          <Card className="sharp-card">
            <Title level={2} className="section-title">Мои проекты</Title>
            
            <Tabs 
              activeKey={activeTab} 
              onChange={setActiveTab}
              className="sharp-tabs"
            >
              <TabPane tab="Активные" key="active" />
              <TabPane tab="Архивные" key="archive" />
            </Tabs>

            {activeTab === 'active' ? (
              <div className="empty-state">
                <Empty
                  description="Пока нет активных проектов"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
                <Button type="primary" className="sharp-btn mt-20">
                  Создать первый проект
                </Button>
              </div>
            ) : (
              <div className="empty-state">
                <Empty
                  description="Нет архивных проектов"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              </div>
            )}
          </Card>

          <Card className="sharp-card mt-30">
            <Title level={2} className="section-title">Опросный лист</Title>
            
            <div className="form-header">
              <Title level={4} className="form-title">Объект недвижимости</Title>
              <Input 
                placeholder="Введите название объекта" 
                className="sharp-input"
              />
            </div>

            <Row gutter={[30, 30]} className="mt-20">
              <Col span={6}>
                <div className="form-section">
                  <Title level={4} className="form-subtitle">Название</Title>
                </div>
              </Col>
              <Col span={6}>
                <div className="form-section">
                  <Title level={4} className="form-subtitle">Общее</Title>
                </div>
              </Col>
              <Col span={6}>
                <div className="form-section">
                  <Title level={4} className="form-subtitle">Местоположение</Title>
                </div>
              </Col>
              <Col span={6}>
                <div className="form-section">
                  <Title level={4} className="form-subtitle">Эксплуатация</Title>
                </div>
              </Col>
            </Row>

            <Divider className="sharp-divider" />

            <div className="empty-state mt-30">
              <Empty
                description="Заполните опросный лист для создания проекта"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PersonalAcc;