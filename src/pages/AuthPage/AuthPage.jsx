import React, { useState } from 'react';
import { 
  Form, 
  Input, 
  Button, 
  Card, 
  Typography, 
  Tabs,
  Checkbox,
  message 
} from 'antd';
import { 
  MailOutlined, 
  LockOutlined,
  LoginOutlined,
  UserOutlined  
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import './AuthPage.css';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const AuthPage = () => {
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      console.log('Form values:', values);

      if (activeTab === 'login') {
        message.success('Вход выполнен успешно');
        setTimeout(() => {
          window.location.href = '/personal';
        }, 500);
      } else {
        message.success('Регистрация успешна');
        setActiveTab('login');
        form.resetFields();
      }
    } catch (error) {
      message.error(error.message || 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const onFinishFailed = (errorInfo) => {
    console.log('Failed:', errorInfo);
    message.error('Пожалуйста, заполните все обязательные поля правильно');
  };

  const handleForgotPassword = () => {
    message.info('Функция восстановления пароля в разработке');
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <Title level={1} className="company-title-auth">ЗЕМА</Title>
        </div>

        <Card className="auth-card">
          <Tabs 
            activeKey={activeTab} 
            onChange={setActiveTab}
            centered
            className="auth-tabs"
          >
            <TabPane tab="Вход" key="login">
              <Form
                form={form}
                name="login"
                layout="vertical"
                onFinish={onFinish}
                onFinishFailed={onFinishFailed}
                className="auth-form"
              >
                <Form.Item
                  name="email"
                  rules={[
                    { required: true, message: 'Пожалуйста, введите email' },
                    { type: 'email', message: 'Введите корректный email' }
                  ]}
                >
                  <Input
                    prefix={<MailOutlined />}
                    placeholder="Email"
                    size="large"
                    className="auth-input"
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  rules={[{ required: true, message: 'Пожалуйста, введите пароль' }]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder="Пароль"
                    size="large"
                    className="auth-input"
                  />
                </Form.Item>

                <div className="form-options">
                  <Button 
                    type="link" 
                    onClick={handleForgotPassword}
                    className="forgot-password"
                  >
                    Забыли пароль?
                  </Button>
                </div>

                <Form.Item>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    loading={loading}
                    block
                    size="large"
                    className="auth-button"
                    icon={<LoginOutlined />}
                  >
                    Войти
                  </Button>
                </Form.Item>

                <div className="auth-footer">
                  <Text>Нет аккаунта? </Text>
                  <Button 
                    type="link" 
                    onClick={() => setActiveTab('register')}
                    className="switch-auth"
                  >
                    Зарегистрируйтесь!
                  </Button>
                </div>
              </Form>
            </TabPane>

            <TabPane tab="Регистрация" key="register">
              <Form
                form={form}
                name="register"
                layout="vertical"
                onFinish={onFinish}
                onFinishFailed={onFinishFailed}
                className="auth-form"
              >
                <Form.Item
                  name="firstName"
                  rules={[{ required: true, message: 'Пожалуйста, введите имя' }]}
                >
                  <Input
                    prefix={<UserOutlined />}
                    placeholder="Имя"
                    size="large"
                    className="auth-input"
                  />
                </Form.Item>

                <Form.Item
                  name="lastName"
                  rules={[{ required: true, message: 'Пожалуйста, введите фамилию' }]}
                >
                  <Input
                    prefix={<UserOutlined />}
                    placeholder="Фамилия"
                    size="large"
                    className="auth-input"
                  />
                </Form.Item>

                <Form.Item
                  name="email"
                  rules={[
                    { required: true, message: 'Пожалуйста, введите email' },
                    { type: 'email', message: 'Введите корректный email' }
                  ]}
                >
                  <Input
                    prefix={<MailOutlined />}
                    placeholder="Email"
                    size="large"
                    className="auth-input"
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  rules={[
                    { required: true, message: 'Пожалуйста, введите пароль' },
                    { min: 6, message: 'Пароль должен быть минимум 6 символов' }
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder="Пароль"
                    size="large"
                    className="auth-input"
                  />
                </Form.Item>

                <Form.Item
                  name="confirmPassword"
                  dependencies={['password']}
                  rules={[
                    { required: true, message: 'Пожалуйста, подтвердите пароль' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('password') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('Пароли не совпадают'));
                      },
                    }),
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder="Подтвердите пароль"
                    size="large"
                    className="auth-input"
                  />
                </Form.Item>

                <Form.Item>
                  <Checkbox>
                    Я соглашаюсь с Политикой обработки персональных данных
                  </Checkbox>
                </Form.Item>

                <Form.Item>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    loading={loading}
                    block
                    size="large"
                    className="auth-button"
                  >
                    Зарегистрироваться
                  </Button>
                </Form.Item>

                <div className="auth-footer">
                  <Text>Уже есть аккаунт? </Text>
                  <Button 
                    type="link" 
                    onClick={() => setActiveTab('login')}
                    className="switch-auth"
                  >
                    Войти
                  </Button>
                </div>
              </Form>
            </TabPane>
          </Tabs>

          <div className="privacy-notice">
            <Text type="secondary">
              Используя платформу, вы соглашаетесь с Политикой обработки персональных данных
            </Text>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AuthPage;