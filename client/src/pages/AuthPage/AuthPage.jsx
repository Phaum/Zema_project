import React, { useEffect, useMemo, useState } from 'react';
import {
  Form,
  Input,
  Button,
  Card,
  Typography,
  Tabs,
  Checkbox,
  message,
  Modal,
} from 'antd';
import {
  MailOutlined,
  LockOutlined,
  LoginOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './AuthPage.css';

const { Title, Text, Paragraph } = Typography;

const AuthPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const routeTab = useMemo(() => {
    return location.pathname === '/register' ? 'register' : 'login';
  }, [location.pathname]);

  const [activeTab, setActiveTab] = useState(routeTab);
  const [loading, setLoading] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  useEffect(() => {
    setActiveTab(routeTab);
    loginForm.resetFields();
    registerForm.resetFields();
  }, [routeTab, loginForm, registerForm]);

  const handleTabChange = (key) => {
    setActiveTab(key);
    loginForm.resetFields();
    registerForm.resetFields();
    navigate(key === 'register' ? '/register' : '/login', { replace: true });
  };

  const handleLoginFinish = async (values) => {
    setLoading(true);

    try {
      const response = await login({
        email: values.email,
        password: values.password,
      });

      message.success(response?.message || 'Успешный вход');

      const targetPath =
          typeof location.state?.from === 'string' ? location.state.from : '/personal';

      navigate(targetPath, { replace: true });
    } catch (err) {
      message.error(err.response?.data?.error || err.message || 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterFinish = async (values) => {
    setLoading(true);

    try {
      await register({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      });

      message.success('Регистрация успешна. Теперь войдите в аккаунт.');
      registerForm.resetFields();
      loginForm.setFieldsValue({ email: values.email });
      setActiveTab('login');
      navigate('/login', { replace: true });
    } catch (err) {
      message.error(err.response?.data?.error || err.message || 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const onFinishFailed = () => {
    message.error('Пожалуйста, заполните все обязательные поля правильно');
  };

  const handleForgotPassword = () => {
    message.info('Функция восстановления пароля в разработке');
  };

  return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-header">
            <Title level={1} className="company-title-auth">
              ЗЕМА
            </Title>
          </div>

          <Card className="auth-card">
            <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                centered
                className="auth-tabs"
                items={[
                  {
                    key: 'login',
                    label: 'Вход',
                    children: (
                        <Form
                            form={loginForm}
                            name="login"
                            layout="vertical"
                            onFinish={handleLoginFinish}
                            onFinishFailed={onFinishFailed}
                            className="auth-form"
                        >
                          <Form.Item
                              name="email"
                              rules={[
                                { required: true, message: 'Пожалуйста, введите email' },
                                { type: 'email', message: 'Введите корректный email' },
                              ]}
                          >
                            <Input
                                prefix={<MailOutlined />}
                                placeholder="Email"
                                size="large"
                                className="auth-input"
                                autoComplete="email"
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
                                autoComplete="current-password"
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
                        </Form>
                    ),
                  },
                  {
                    key: 'register',
                    label: 'Регистрация',
                    children: (
                        <Form
                            form={registerForm}
                            name="register"
                            layout="vertical"
                            onFinish={handleRegisterFinish}
                            onFinishFailed={onFinishFailed}
                            className="auth-form"
                        >
                          <Form.Item
                              name="firstName"
                              rules={[{ required: true, message: 'Введите имя' }]}
                          >
                            <Input
                                prefix={<UserOutlined />}
                                placeholder="Имя"
                                size="large"
                                className="auth-input"
                                autoComplete="given-name"
                            />
                          </Form.Item>

                          <Form.Item
                              name="lastName"
                              rules={[{ required: true, message: 'Введите фамилию' }]}
                          >
                            <Input
                                prefix={<UserOutlined />}
                                placeholder="Фамилия"
                                size="large"
                                className="auth-input"
                                autoComplete="family-name"
                            />
                          </Form.Item>

                          <Form.Item
                              name="email"
                              rules={[
                                { required: true, message: 'Пожалуйста, введите email' },
                                { type: 'email', message: 'Введите корректный email' },
                              ]}
                          >
                            <Input
                                prefix={<MailOutlined />}
                                placeholder="Email"
                                size="large"
                                className="auth-input"
                                autoComplete="email"
                            />
                          </Form.Item>

                          <Form.Item
                              name="password"
                              rules={[
                                { required: true, message: 'Пожалуйста, введите пароль' },
                                { min: 6, message: 'Пароль должен быть минимум 6 символов' },
                              ]}
                          >
                            <Input.Password
                                prefix={<LockOutlined />}
                                placeholder="Пароль"
                                size="large"
                                className="auth-input"
                                autoComplete="new-password"
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
                                autoComplete="new-password"
                            />
                          </Form.Item>

                          <Form.Item
                              name="agreement"
                              valuePropName="checked"
                              rules={[
                                {
                                  validator: (_, value) =>
                                      value
                                          ? Promise.resolve()
                                          : Promise.reject(
                                              new Error('Нужно согласиться с политикой обработки персональных данных')
                                          ),
                                },
                              ]}
                          >
                            <Checkbox>
                        <span className="auth-policy-checkbox-text">
                          <button
                              type="button"
                              className="auth-policy-link"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPolicyOpen(true);
                              }}
                          >
                            Я соглашаюсь с Политикой обработки персональных данных
                          </button>
                        </span>
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
                                icon={<LoginOutlined />}
                            >
                              Зарегистрироваться
                            </Button>
                          </Form.Item>
                        </Form>
                    ),
                  },
                ]}
            />
          </Card>
        </div>

        <Modal
            open={policyOpen}
            onCancel={() => setPolicyOpen(false)}
            footer={[
              <Button key="close" type="primary" className="auth-button auth-modal-btn" onClick={() => setPolicyOpen(false)}>
                Понятно
              </Button>,
            ]}
            title="Политика обработки персональных данных"
            width={760}
            centered
            className="auth-policy-modal"
        >
          <div className="auth-policy-content">
            <Paragraph>
              Настоящая политика определяет порядок обработки и защиты персональных данных
              пользователей платформы Zema.
            </Paragraph>

            <Paragraph>
              При регистрации и использовании платформы могут обрабатываться следующие данные:
              имя, фамилия, адрес электронной почты, данные об объектах недвижимости, а также
              иные сведения, которые пользователь добровольно передает через формы системы.
            </Paragraph>

            <Paragraph>
              Персональные данные обрабатываются для регистрации пользователя, предоставления
              доступа к функционалу платформы, сохранения проектов оценки, обратной связи,
              улучшения качества сервиса и исполнения требований законодательства.
            </Paragraph>

            <Paragraph>
              Платформа принимает необходимые организационные и технические меры для защиты
              персональных данных от неправомерного доступа, изменения, раскрытия или уничтожения.
            </Paragraph>

            <Paragraph>
              Пользователь подтверждает, что предоставляет достоверные данные и соглашается на их
              обработку в объеме, необходимом для работы платформы.
            </Paragraph>

            <Text type="secondary">
              При необходимости этот текст можно позже вынести в отдельный endpoint или CMS-блок,
              но для текущего этапа его удобно держать прямо в интерфейсе авторизации.
            </Text>
          </div>
        </Modal>
      </div>
  );
};

export default AuthPage;
