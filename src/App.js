import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Layout } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import AppHeader from './components/Header/Header';
import HomePage from './pages/HomePage/HomePage';
import AuthPage from './pages/AuthPage/AuthPage';
import ServicesPage from './pages/ServicesPage/ServicesPage';
import PersonalAcc from './pages/PersonalAcc/PersonalAcc';
import AnalyticsPage from './pages/AnalyticsPage/AnalyticsPage';
import AboutPage from './pages/AboutPage/AboutPage';
import ContactsPage from './pages/ContactsPage/ContactsPage';
import ProtectedRoute from './components/ProtectedRoute';
import GuestOnlyRoute from './components/GuestOnlyRoute';
import { AuthProvider } from './context/AuthContext';
import './App.css';
import 'leaflet/dist/leaflet.css';

const { Content } = Layout;

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
            <AuthProvider>
                <Router>
                    <Layout className="app-layout">
                        <AppHeader />
                        <Content className="app-content">
                            <Routes>
                                <Route path="/" element={<HomePage />} />
                                <Route path="/home" element={<HomePage />} />

                                <Route
                                    path="/login"
                                    element={
                                        <GuestOnlyRoute>
                                            <AuthPage />
                                        </GuestOnlyRoute>
                                    }
                                />

                                <Route
                                    path="/register"
                                    element={
                                        <GuestOnlyRoute>
                                            <AuthPage />
                                        </GuestOnlyRoute>
                                    }
                                />

                                <Route path="/analytics" element={<AnalyticsPage />} />
                                <Route path="/services" element={<ServicesPage />} />
                                <Route path="/about" element={<AboutPage />} />
                                <Route path="/contacts" element={<ContactsPage />} />

                                <Route
                                    path="/personal"
                                    element={
                                        <ProtectedRoute>
                                            <PersonalAcc />
                                        </ProtectedRoute>
                                    }
                                />

                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                        </Content>
                    </Layout>
                </Router>
            </AuthProvider>
        </ConfigProvider>
    );
};

export default App;