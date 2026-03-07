// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Layout } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import AppHeader from './components/Header/Header';
import HomePage from './pages/HomePage/HomePage';
import AuthPage from './pages/AuthPage/AuthPage';
import ServicesPage from './pages/ServicesPage/ServicesPage';
import PersonalAcc from './pages/PersonalAcc/PersonalAcc';
import QuestionaryPage from './pages/QuestPage/QuestionaryPage'; // Добавить импорт
import './App.css';

const { Content } = Layout;

const PagePlaceholder = ({ title, children }) => (
  <div className="page-placeholder">
    <h1 className="text-primary">{title}</h1>
    {children && <p className="text-secondary">{children}</p>}
  </div>
);

const App = () => {
  return (
    <ConfigProvider
      locale={ruRU}
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 0,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
      }}
    >
      <Router>
        <Layout className="app-layout">
          <AppHeader />
          <Content className="app-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/register" element={<AuthPage />} />
              <Route path="/questionary" element={<QuestionaryPage />} /> {/* Добавить новый маршрут */}
              <Route path="/analytics" element={<PagePlaceholder title="Аналитика">Раздел в разработке</PagePlaceholder>} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/about" element={<PagePlaceholder title="О проекте">Информация о платформе ЗЕМА</PagePlaceholder>} />
              <Route path="/contacts" element={<PagePlaceholder title="Контакты">Свяжитесь с нами</PagePlaceholder>} />
              <Route path="/personal" element={<PersonalAcc />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Content>
        </Layout>
      </Router>
    </ConfigProvider>
  );
};

export default App;