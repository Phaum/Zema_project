import React, { useMemo } from 'react';
import { Layout, Menu, Button, Typography, Dropdown, Avatar, Space } from 'antd';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LoginOutlined,
  UserOutlined,
  LogoutOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

const { Header } = Layout;
const { Title } = Typography;

const AppHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const menuItems = [
    {
      key: 'analytics',
      label: 'Аналитика',
      onClick: () => navigate('/analytics'),
    },
    {
      key: 'services',
      label: 'Услуги',
      onClick: () => navigate('/services'),
    },
    {
      key: 'about',
      label: 'О проекте',
      onClick: () => navigate('/about'),
    },
    {
      key: 'contacts',
      label: 'Контакты',
      onClick: () => navigate('/contacts'),
    },
  ];

  const currentPath = location.pathname;
  const activeKey =
      menuItems.find(
          (item) =>
              (item.key === 'analytics' && currentPath === '/analytics') ||
              (item.key === 'services' && currentPath === '/services') ||
              (item.key === 'about' && currentPath === '/about') ||
              (item.key === 'contacts' && currentPath === '/contacts')
      )?.key || '';

  const displayName = useMemo(() => {
    if (!user) return 'Профиль';
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    return fullName || user.email || 'Профиль';
  }, [user]);

  const dropdownItems = [
    {
      key: 'personal',
      icon: <UserOutlined />,
      label: 'Личный кабинет',
      onClick: () => navigate('/personal'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Выйти',
      onClick: () => {
        logout();
        navigate('/login', { replace: true });
      },
    },
  ];

  return (
      <Header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <Link to="/" className="logo-link">
              <Title level={2} className="company-logo">
                ЗЕМА
              </Title>
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
            {isAuthenticated ? (
                <Dropdown
                    menu={{ items: dropdownItems }}
                    trigger={['click']}
                    placement="bottomRight"
                >
                  <Button className="profile-button">
                    <Space size={10}>
                      <Avatar size={28} icon={<UserOutlined />} className="profile-avatar" />
                      <span className="profile-button-text">{displayName}</span>
                      <DownOutlined />
                    </Space>
                  </Button>
                </Dropdown>
            ) : (
                <Link to="/login">
                  <Button
                      type="primary"
                      icon={<LoginOutlined />}
                      className="login-button"
                  >
                    Войти
                  </Button>
                </Link>
            )}
          </div>
        </div>
      </Header>
  );
};

export default AppHeader;