import React, { useEffect, useState } from 'react';
import { Button, Card, Divider, Empty, Typography, message, Row, Col, Statistic, Tag, Space, Tooltip } from 'antd';
import { DollarOutlined, CalculatorOutlined, BarChartOutlined, FilePdfOutlined, InfoCircleOutlined } from '@ant-design/icons';
import api from '../../components/projects/api';
import { exportResultToPDF } from '../../utils/pdfExport';
import { getFieldLabel, getFieldTooltip } from '../../utils/fieldTranslations';

const { Title, Text, Paragraph } = Typography;

export default function ProjectResultPanel({ projectId, onBack }) {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [snapshot, setSnapshot ] = useState(null);

    useEffect(() => {
        async function loadResult() {
            try {
                setLoading(true);
                const { data } = await api.get(`/projects/${projectId}/result`);
                setResult(data);
                setSnapshot(data?.market_snapshot_json || null);
            } catch (error) {
                message.error(error?.response?.data?.error || 'Не удалось загрузить результат');
            } finally {
                setLoading(false);
            }
        }

        loadResult();
    }, [projectId]);

    if (!result && !loading) {
        return <Empty description="Результат пока не рассчитан" />;
    }

    return (
        <Card loading={loading}>
            <div id="result-content">
                <Title level={2}>Результат оценки</Title>
                <Paragraph>
                    Результат расчёта стоимости объекта доходным подходом
                </Paragraph>

            <Divider />

            {/* Main Result */}
            <Card
                style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    borderRadius: '8px',
                    marginBottom: 16,
                }}
            >
                <Text style={{ color: 'rgba(255,255,255,0.85)' }}>Стоимость объекта</Text>
                <Title level={1} style={{ color: 'white', margin: '8px 0 0 0' }}>
                    {Number(result?.estimated_value || 0).toLocaleString('ru-RU')} ₽
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.75)' }}>
                    {Number(result?.price_per_m2 || 0).toLocaleString('ru-RU')} ₽/м²
                </Text>
            </Card>

            <Divider />

            {/* Income Flow */}
            <Title level={4}>
                <Tooltip title={getFieldTooltip('gross_income')}>
                    Поток доходов <InfoCircleOutlined />
                </Tooltip>
            </Title>
            <Row gutter={16}>
                <Col xs={24} sm={12} md={6}>
                    <Card size="small" style={{ background: '#f0f5ff' }}>
                        <Tooltip title={getFieldTooltip('gross_income')}>
                            <Statistic
                                title="ПВД"
                                value={Math.round(Number(result?.gross_income || 0))}
                                suffix="₽"
                                valueStyle={{ fontSize: '14px' }}
                            />
                        </Tooltip>
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                            Потенциальный доход
                        </Text>
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card size="small" style={{ background: '#e6f7ff' }}>
                        <Tooltip title={getFieldTooltip('egi')}>
                            <Statistic
                                title="ЭВД"
                                value={Math.round(Number(result?.egi || 0))}
                                suffix="₽"
                                valueStyle={{ fontSize: '14px' }}
                            />
                        </Tooltip>
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                            Эффективный доход
                        </Text>
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card size="small" style={{ background: '#fff7e6' }}>
                        <Tooltip title={getFieldTooltip('opex')}>
                            <Statistic
                                title="ОПЕХ"
                                value={Math.round(Number(result?.opex || 0))}
                                suffix="₽"
                                valueStyle={{ fontSize: '14px' }}
                            />
                        </Tooltip>
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                            Операционные расходы
                        </Text>
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card size="small" style={{ background: '#f6ffed' }}>
                        <Tooltip title={getFieldTooltip('noi')}>
                            <Statistic
                                title="ЧОД"
                                value={Math.round(Number(result?.noi || 0))}
                                suffix="₽"
                                valueStyle={{ fontSize: '14px' }}
                            />
                        </Tooltip>
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                            Чистый доход
                        </Text>
                    </Card>
                </Col>
            </Row>

            <Divider />

            {/* Key Metrics */}
            <Title level={4}>
                <Tooltip title="Основные параметры, использованные при расчете">
                    Параметры расчета <InfoCircleOutlined />
                </Tooltip>
            </Title>
            <Row gutter={16}>
                <Col xs={24} sm={8}>
                    <Tooltip title={getFieldTooltip('rental_rate')}>
                        <Statistic
                            title="Ставка аренды"
                            value={Number(result?.rental_rate || 0).toLocaleString('ru-RU')}
                            suffix="₽/м²"
                            prefix={
                                result?.rental_rate_source === 'manual' ? (
                                    <Tag color="orange">Вручную</Tag>
                                ) : (
                                    <Tag color="cyan">Рынок</Tag>
                                )
                            }
                        />
                    </Tooltip>
                </Col>
                <Col xs={24} sm={8}>
                    <Tooltip title={getFieldTooltip('capitalization_rate')}>
                        <Statistic
                            title="Ставка капитализации"
                            value={(Number(result?.capitalization_rate || 0) * 100).toFixed(2)}
                            suffix="%"
                        />
                    </Tooltip>
                </Col>
                <Col xs={24} sm={8}>
                    <Tooltip title={getFieldTooltip('land_share')}>
                        <Statistic
                            title="Доля земли в стоимости"
                            value={Number(result?.land_share || 0)}
                            precision={1}
                            suffix="₽"
                        />
                    </Tooltip>
                </Col>
            </Row>

            {snapshot ? (
                <>
                    <Divider />
                    <Title level={4}>
                        <Tooltip title="Данные с рынка похожих объектов">
                            Рыночные данные <InfoCircleOutlined />
                        </Tooltip>
                    </Title>
                    <Row gutter={16}>
                        <Col xs={24} sm={8}>
                            <Tooltip title={getFieldTooltip('comparableCount')}>
                                <Statistic
                                    title="Использовано аналогов"
                                    value={Number(snapshot.comparableCount || 0)}
                                    suffix="объектов"
                                />
                            </Tooltip>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Tooltip title={getFieldTooltip('medianRentalRate')}>
                                <Statistic
                                    title="Рыночная ставка"
                                    value={Math.round(Number(snapshot.medianRentalRate || 0))}
                                    suffix="₽/м²"
                                />
                            </Tooltip>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Tooltip title="Диапазон ставок на рынке">
                                <Statistic
                                    title="Диапазон ставок"
                                    value={`${Math.round(Number(snapshot.minRentalRate || 0))} - ${Math.round(Number(snapshot.maxRentalRate || 0))}`}
                                    suffix="₽/м²"
                                />
                            </Tooltip>
                        </Col>
                    </Row>
                </>
            ) : null}
            </div>

            <Divider />

            <Space>
                <Button onClick={onBack}>Назад к расчёту</Button>
                <Button
                    type="primary"
                    icon={<FilePdfOutlined />}
                    onClick={() => exportResultToPDF(projectId, result?.project_name || result?.projectName || '')}
                >
                    Экспортировать в PDF
                </Button>
            </Space>
        </Card>
    );
}
