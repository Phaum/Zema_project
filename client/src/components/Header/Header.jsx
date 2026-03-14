import React from 'react';
import { Layout, Menu, Button, Typography } from 'antd';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LoginOutlined } from '@ant-design/icons';
import './Header.css';

const { Header } = Layout;
const { Title } = Typography;

const AppHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const menuItems = [
    {
      key: 'analytics',
      label: 'Аналитика',
      onClick: () => navigate('/analytics')
    },
    {
      key: 'services',
      label: 'Услуги',
      onClick: () => navigate('/services')
    },
    {
      key: 'about',
      label: 'О проекте',
      onClick: () => navigate('/about')
    },
    {
      key: 'contacts',
      label: 'Контакты',
      onClick: () => navigate('/contacts')
    }
  ];

  const currentPath = location.pathname;
  const activeKey = menuItems.find(item => 
    item.key === 'analytics' && currentPath === '/analytics' ||
    item.key === 'services' && currentPath === '/services' ||
    item.key === 'about' && currentPath === '/about' ||
    item.key === 'contacts' && currentPath === '/contacts'
  )?.key || '';

  return (
    <Header className="app-header">
      <div className="header-content">
        <div className="logo-section">
          <Link to="/" className="logo-link">
            <Title level={2} className="company-logo">ЗЕМА</Title>
          </Link>
        </div>

        <div className="nav-center">
          <Menu
            mode="horizontal"
            items={menuItems}
            className="nav-menu"
            selectedKeys={[activeKey]}
          />
        </div>
        
        <div className="auth-section">
          <Link to="/login">
            <Button 
              type="primary" 
              icon={<LoginOutlined />}
              className="login-button"
            >
              Войти
            </Button>
          </Link>
        </div>
      </div>
    </Header>
  );
};

export default AppHeader;