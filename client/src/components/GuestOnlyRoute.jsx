import React from 'react';
import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '../context/AuthContext';

const pageStyle = {
    minHeight: 'calc(100vh - 70px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const GuestOnlyRoute = ({ children }) => {
    const { isReady, isAuthenticated } = useAuth();

    if (!isReady) {
        return (
            <div style={pageStyle}>
                <Spin size="large" />
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/personal" replace />;
    }

    return children;
};

export default GuestOnlyRoute;