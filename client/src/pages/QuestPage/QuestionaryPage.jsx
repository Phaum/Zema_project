import React, { useState, useEffect } from 'react';
import { 
  Button, 
  Typography, 
  Form, 
  Input, 
  Select, 
  Radio, 
  DatePicker, 
  Table, 
  Tooltip, 
  Row, 
  Col, 
  Card,
  Divider,
  Space,
  Modal,
  message,
  Result,
  Tabs,
  Statistic
} from 'antd';
import { 
  QuestionCircleOutlined, 
  EnvironmentOutlined, 
  CheckCircleOutlined,
  EditOutlined,
  CalculatorOutlined,
  InfoCircleOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import './QuestionaryPage.css';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const QuestionaryPage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(1);
  const [calculationMethod, setCalculationMethod] = useState('');
  const [showExtendedTable, setShowExtendedTable] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [calculationResult, setCalculationResult] = useState(null);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [locationData, setLocationData] = useState({
    address: '',
    confirmedAddress: ''
  });

  const [floorData, setFloorData] = useState([
    {
      key: 'basement',
      floor: 'Подвал',
      purpose: '',
      area: '',
      leasableArea: '',
      avgLeasableArea: ''
    },
    {
      key: 'ground',
      floor: 'Цокольный',
      purpose: '',
      area: '',
      leasableArea: '',
      avgLeasableArea: ''
    },
    {
      key: 'first',
      floor: 'Первый',
      purpose: '',
      area: '',
      leasableArea: '',
      avgLeasableArea: ''
    },
    {
      key: 'above',
      floor: 'Второй этаж и выше',
      purpose: '',
      area: '',
      leasableArea: '',
      avgLeasableArea: ''
    }
  ]);

  useEffect(() => {
    setShowExtendedTable(calculationMethod === 'factual');
  }, [calculationMethod]);

  const floorColumns = [
    {
      title: 'Этаж расположения',
      dataIndex: 'floor',
      key: 'floor',
      fixed: 'left',
      width: 150,
    },
    {
      title: 'Назначение',
      dataIndex: 'purpose',
      key: 'purpose',
      width: 200,
      render: (text, record) => (
        <Select
          style={{ width: '100%' }}
          placeholder="Выберите назначение"
          value={text}
          onChange={(value) => handlePurposeChange(record.key, value)}
        >
          <Option value="office">Офисное</Option>
          <Option value="retail">Торговое</Option>
          <Option value="warehouse">Складское</Option>
        </Select>
      ),
    },
    {
      title: 'Площадь, кв.м',
      dataIndex: 'area',
      key: 'area',
      width: 120,
      render: (text, record) => (
        <Input
          type="number"
          value={text}
          onChange={(e) => handleAreaChange(record.key, 'area', e.target.value)}
          placeholder="Ручной ввод"
        />
      ),
    },
    {
      title: 'Арендопригодная площадь, кв.м',
      dataIndex: 'leasableArea',
      key: 'leasableArea',
      width: 200,
      render: (text, record) => (
        showExtendedTable ? (
          <Input
            type="number"
            value={text}
            onChange={(e) => handleAreaChange(record.key, 'leasableArea', e.target.value)}
            placeholder="Ручной ввод"
          />
        ) : (
          <Text type="secondary">—</Text>
        )
      ),
    },
    {
      title: 'Средняя площадь арендопригодного помещения на этаже',
      dataIndex: 'avgLeasableArea',
      key: 'avgLeasableArea',
      width: 250,
      render: (text, record) => (
        showExtendedTable ? (
          <Input
            type="number"
            value={text}
            onChange={(e) => handleAreaChange(record.key, 'avgLeasableArea', e.target.value)}
            placeholder="Ручной ввод"
          />
        ) : (
          <Text type="secondary">—</Text>
        )
      ),
    },
  ];

  const handlePurposeChange = (key, value) => {
    const newData = floorData.map(item => 
      item.key === key ? { ...item, purpose: value } : item
    );
    setFloorData(newData);
  };

  const handleAreaChange = (key, field, value) => {
    const newData = floorData.map(item => 
      item.key === key ? { ...item, [field]: value } : item
    );
    setFloorData(newData);
  };

  //обработка подтверждения адреса на карте
  const handleMapConfirm = () => {
    setLocationData({
      ...locationData,
      confirmedAddress: 'г. Санкт-Петербург, Невский пр-кт, д. 1' // Пример
    });
    setMapModalVisible(false);
    message.success('Адрес подтвержден');
  };

  const calculateTotal = () => {
    const totalArea = floorData.reduce((sum, item) => sum + (Number(item.area) || 0), 0);
    const totalLeasable = floorData.reduce((sum, item) => sum + (Number(item.leasableArea) || 0), 0);
    const buildingTotalArea = form.getFieldValue('totalArea') || 0;
    const leasableCoefficient = buildingTotalArea ? (totalLeasable / buildingTotalArea).toFixed(3) : 0;

    //здесь потом будет логика расчета стоимости
    const marketValue = 150000000;
    const cadastralValue = 145000000;

    setCalculationResult({
      marketValue,
      cadastralValue,
      leasableCoefficient,
      totalLeasable,
      totalArea: buildingTotalArea,
      date: dayjs().format('DD.MM.YYYY')
    });
  };

  const handleSubmit = () => {
    form.validateFields().then(values => {
      calculateTotal();
      setShowResult(true);
      message.success('Данные успешно сохранены');
    }).catch(error => {
      message.error('Пожалуйста, заполните все обязательные поля');
    });
  };

  const MapModal = () => (
    <Modal
      title="Укажите местоположение на карте"
      open={mapModalVisible}
      onCancel={() => setMapModalVisible(false)}
      width={800}
      footer={[
        <Button key="cancel" onClick={() => setMapModalVisible(false)}>
          Отмена
        </Button>,
        <Button key="submit" type="primary" onClick={handleMapConfirm}>
          Подтвердить адрес
        </Button>,
      ]}
    >
      <div className="map-container">
        <div className="map-placeholder">
          <EnvironmentOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
          <Text>Здесь будет отображаться карта для выбора местоположения</Text>
          <Text type="secondary" style={{ marginTop: 8 }}>
            (Интеграция с картографическим сервисом)
          </Text>
        </div>
        <div style={{ marginTop: 16 }}>
          <Text strong>Адрес по данным ЕГРН:</Text>
          <Input 
            value={locationData.address || 'г. Санкт-Петербург, Невский пр-кт, д. 1'}
            onChange={(e) => setLocationData({...locationData, address: e.target.value})}
            style={{ marginTop: 8 }}
          />
        </div>
      </div>
    </Modal>
  );

  if (showResult && calculationResult) {
    return (
      <div className="questionary-container">
        <div className="questionary-header">
          <Title level={2}>Результаты расчета</Title>
          <Text type="secondary">Дата оценки: {calculationResult.date}</Text>
        </div>

        <div className="result-section">
          <Row gutter={[24, 24]}>
            <Col span={24}>
              <Card className="result-card warning-card">
                <div className="warning-message">
                  <InfoCircleOutlined style={{ color: '#faad14', fontSize: 24 }} />
                  <Text strong style={{ marginLeft: 12 }}>
                    Внимание! Подтвердите правильность введенных данных! 
                    Изменение вводимых параметров в рамках текущего расчета после подтверждения становится невозможным!
                  </Text>
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[24, 24]}>
            <Col span={12}>
              <Card className="result-card">
                <Statistic
                  title="Рыночная стоимость (без учета НДС)"
                  value={calculationResult.marketValue / 1000000}
                  precision={2}
                  suffix="млн ₽"
                  valueStyle={{ color: '#1890ff', fontSize: 36 }}
                />
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">Кадастровая стоимость: </Text>
                  <Text strong>{(calculationResult.cadastralValue / 1000000).toFixed(2)} млн ₽</Text>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">Отклонение: </Text>
                  <Text strong type={calculationResult.marketValue > calculationResult.cadastralValue ? 'danger' : 'success'}>
                    {((calculationResult.marketValue - calculationResult.cadastralValue) / calculationResult.cadastralValue * 100).toFixed(1)}%
                  </Text>
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card className="result-card">
                <Statistic
                  title="Коэффициент арендопригодной площади"
                  value={calculationResult.leasableCoefficient}
                  precision={3}
                  valueStyle={{ color: '#52c41a', fontSize: 36 }}
                />
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">Общая площадь: </Text>
                  <Text strong>{calculationResult.totalArea} кв.м</Text>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">Арендопригодная площадь: </Text>
                  <Text strong>{calculationResult.totalLeasable} кв.м</Text>
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
            <Col span={24}>
              <Card className="result-card">
                <Title level={4}>Выберите формат отображения результата</Title>
                <Space size="large" style={{ marginTop: 16 }}>
                  <Button 
                    type="primary" 
                    size="large"
                    icon={<CalculatorOutlined />}
                    onClick={() => message.info('Отображается усредненная цена')}
                  >
                    Усредненная цена
                  </Button>
                  <Button 
                    size="large"
                    icon={<InfoCircleOutlined />}
                    onClick={() => message.info('Отображается диапазон цен')}
                  >
                    Диапазон цен
                  </Button>
                </Space>
              </Card>
            </Col>
          </Row>

          <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
            <Col span={24} style={{ textAlign: 'center' }}>
              <Space size="large">
                <Button 
                  size="large"
                  icon={<EditOutlined />}
                  onClick={() => setShowResult(false)}
                >
                  Вернуться к редактированию
                </Button>
                <Button 
                  type="primary" 
                  size="large"
                  onClick={() => {
                    message.success('Расчет сохранен');
                    navigate('/');
                  }}
                >
                  Сохранить результаты
                </Button>
              </Space>
            </Col>
          </Row>
        </div>
      </div>
    );
  }

  return (
    <div className="questionary-container">
      <MapModal />
      
      <div className="questionary-header">
        <div className="header-content">
          <Title level={2}>Анкета объекта недвижимости</Title>
          <Text type="secondary">Заполните данные для получения рыночной оценки</Text>
        </div>
        <div className="header-progress">
          <Text strong>Шаг {currentStep} из 2</Text>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        className="questionary-form"
        initialValues={{
          calculationMethod: 'market',
          objectType: 'Здание',
          actualUse: 'business-center',
          classBC: 'B',
          hasGroundFloor: 'no',
          prepayment: 'no',
          securityDeposit: 'no'
        }}
      >
        {/* Шаг 1: Основные данные */}
        {currentStep === 1 && (
          <>
            <Card className="form-card" title="Основные параметры">
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item 
                    name="calculationMethod" 
                    label={
                      <Space>
                        <Text strong>Выбор способа расчета данных</Text>
                        <Tooltip title="Для расчета необходимо заполнить данные об арендопригодной площади и текущей загруженности арендных площадей">
                          <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                        </Tooltip>
                      </Space>
                    }
                  >
                    <Radio.Group 
                      onChange={(e) => setCalculationMethod(e.target.value)}
                      value={calculationMethod}
                    >
                      <Space direction="vertical">
                        <Radio value="market">по рыночным данным</Radio>
                        <Radio value="factual">по фактическим данным здания с учетом рыночных данных</Radio>
                      </Space>
                    </Radio.Group>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item 
                    name="projectName" 
                    label="Название Проекта"
                    rules={[{ required: true, message: 'Введите название проекта' }]}
                  >
                    <Input placeholder="Ручной ввод" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item 
                    name="cadastralNumber" 
                    label="Кадастровый номер здания"
                    rules={[
                      { required: true, message: 'Введите кадастровый номер' },
                      { pattern: /^\d{2}:\d{2}:\d{7}:\d{2}$/, message: 'Неверный формат (00:00:0000000:00)' }
                    ]}
                  >
                    <Input placeholder="00:00:0000000:00" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item 
                    name="assessmentDate" 
                    label="Дата оценки"
                    rules={[{ required: true, message: 'Выберите дату оценки' }]}
                    extra={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Согласно п. 4 ст. 22 Федерального закона от 03.07.2016 № 237-ФЗ...
                      </Text>
                    }
                  >
                    <DatePicker 
                      style={{ width: '100%' }} 
                      format="DD.MM.YYYY"
                      placeholder="Выберите дату"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={24}>
                <Col span={8}>
                  <Form.Item name="objectType" label="Вид объекта">
                    <Input disabled value="Здание" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="actualUse" label="Фактическое использование">
                    <Radio.Group>
                      <Radio value="business-center">бизнес-центр</Radio>
                      <Radio value="administrative">административное здание</Radio>
                    </Radio.Group>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item 
                    name="classBC" 
                    label="Класс БЦ"
                    rules={[{ required: true }]}
                  >
                    <Select>
                      <Option value="A+">А+</Option>
                      <Option value="A">А</Option>
                      <Option value="B+">В+</Option>
                      <Option value="B">В</Option>
                      <Option value="C">С</Option>
                      <Option value="unknown">не знаю</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              {form.getFieldValue('classBC') === 'unknown' && (
                <Row gutter={24}>
                  <Col span={24}>
                    <Form.Item 
                      name="marketRate" 
                      label="Средняя рыночная ставка аренды помещения в БЦ (₽/кв.м/мес)"
                    >
                      <Input type="number" placeholder="Ручной ввод" />
                    </Form.Item>
                  </Col>
                </Row>
              )}
            </Card>

            <Card className="form-card" title="Местоположение и характеристики">
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item label="Местоположение">
                    <Button 
                      icon={<EnvironmentOutlined />}
                      onClick={() => setMapModalVisible(true)}
                      block
                    >
                      Указать на карте
                    </Button>
                    {locationData.confirmedAddress && (
                      <Text type="success" style={{ display: 'block', marginTop: 8 }}>
                        <CheckCircleOutlined /> {locationData.confirmedAddress}
                      </Text>
                    )}
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item 
                    name="totalArea" 
                    label="Общая площадь (кв.м)"
                    rules={[{ required: true }]}
                  >
                    <Input type="number" placeholder="По данным НСПД" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={24}>
                <Col span={8}>
                  <Form.Item name="yearBuilt" label="Год постройки">
                    <Input type="number" placeholder="По данным НСПД" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="aboveGroundFloors" label="Количество надземных этажей">
                    <Input type="number" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="hasGroundFloor" label="Наличие цокольного этажа">
                    <Radio.Group>
                      <Radio value="yes">Да</Radio>
                      <Radio value="no">Нет</Radio>
                    </Radio.Group>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={24}>
                <Col span={8}>
                  <Form.Item name="undergroundFloors" label="Количество подземных этажей">
                    <Input type="number" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="landCadastralNumber" label="Кадастровый номер ЗУ">
                    <Input placeholder="00:00:0000000:00" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="landArea" label="Площадь ЗУ (кв.м)">
                    <Input type="number" placeholder="По данным НСПД" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card className="form-card" title="Дополнительные параметры">
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item name="prepayment" label="Наличие предоплаты по договорам аренды">
                    <Radio.Group>
                      <Radio value="yes">Да</Radio>
                      <Radio value="no">Нет</Radio>
                    </Radio.Group>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="securityDeposit" label="Наличие страхового депозита">
                    <Radio.Group>
                      <Radio value="yes">Да</Radio>
                      <Radio value="no">Нет</Radio>
                    </Radio.Group>
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </>
        )}

        {/* Шаг 2: Данные по этажам */}
        {currentStep === 2 && (
          <Card className="form-card" title="Данные в разрезе этажей">
            <Table
              columns={floorColumns}
              dataSource={floorData}
              pagination={false}
              bordered
              scroll={{ x: 1000 }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}>ИТОГО</Table.Summary.Cell>
                    <Table.Summary.Cell index={1} />
                    <Table.Summary.Cell index={2}>
                      <Text strong>
                        {floorData.reduce((sum, item) => sum + (Number(item.area) || 0), 0)} кв.м
                      </Text>
                    </Table.Summary.Cell>
                    {showExtendedTable && (
                      <>
                        <Table.Summary.Cell index={3}>
                          <Text strong>
                            {floorData.reduce((sum, item) => sum + (Number(item.leasableArea) || 0), 0)} кв.м
                          </Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4}>
                          <Text strong>
                            {floorData.reduce((sum, item) => sum + (Number(item.avgLeasableArea) || 0), 0)} кв.м
                          </Text>
                        </Table.Summary.Cell>
                      </>
                    )}
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />

            {showExtendedTable && (
              <>
                <Divider />
                <Title level={4}>Дополнительные данные</Title>
                <Row gutter={24}>
                  <Col span={12}>
                    <Form.Item label="Площадь, занятая арендаторами в целом по зданию на текущую дату (кв.м)">
                      <Input type="number" placeholder="Ручной ввод" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Коэффициент арендопригодной площади">
                      <Input disabled value="0.750" addonAfter="Расчетное значение" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={24}>
                  <Col span={24}>
                    <Form.Item label="Коэффициент арендопригодной площади по данным СтатРиелт">
                      <Input disabled value="0.780" />
                    </Form.Item>
                  </Col>
                </Row>
              </>
            )}
          </Card>
        )}

        {/* Навигация */}
        <div className="form-navigation">
          <Space>
            {currentStep === 2 && (
              <Button 
                icon={<ArrowLeftOutlined />}
                onClick={() => setCurrentStep(1)}
              >
                Назад
              </Button>
            )}
            {currentStep === 1 ? (
              <Button 
                type="primary" 
                onClick={() => setCurrentStep(2)}
                icon={<ArrowRightOutlined />}
              >
                Далее
              </Button>
            ) : (
              <Button 
                type="primary" 
                onClick={handleSubmit}
                icon={<CalculatorOutlined />}
              >
                Выполнить расчет
              </Button>
            )}
          </Space>
        </div>
      </Form>
    </div>
  );
};

export default QuestionaryPage;