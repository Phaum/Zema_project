import React, { useState } from 'react';
import { Button, Card, Col, Divider, Row, Space, Typography, message, Statistic, Tag } from 'antd';
import { CalculatorOutlined } from '@ant-design/icons';
import api from '../../components/projects/api';

const { Title, Text } = Typography;

export default function ProjectCalculationPanel({
                                                    projectId,
                                                    project,
                                                    marketContext,
                                                    onBack,
                                                    onCalculated,
                                                }) {
    const [loading, setLoading] = useState(false);
    const q = project?.questionnaire || {};

    const manualRate = Number(q.averageRentalRate || 0);
    const derivedRate = Number(marketContext?.medianRentalRate || 0);
    const rentalRate = manualRate > 0 ? manualRate : derivedRate;
    const rentalRateSource = manualRate > 0 ? 'Ручной ввод' : 'По базе analogues';

    let leasableArea = 0;
    let occupiedArea = 0;
    let pgi = 0;

    if (q.floors && Array.isArray(q.floors) && q.floors.length > 0) {
        for (const floor of q.floors) {
            const floorLeasableArea = Number(floor.leasableArea || 0);
            const floorOccupiedArea = Number(floor.occupiedArea || floorLeasableArea);

            leasableArea += floorLeasableArea;
            occupiedArea += floorOccupiedArea;

            const floorPgi = rentalRate > 0 && floorLeasableArea > 0
                ? rentalRate * floorLeasableArea * 12
                : 0;
            pgi += floorPgi;
        }
    } else {
        leasableArea = Number(q.leasableArea || q.totalArea || 0);
        occupiedArea = q.calculationMethod === 'actual_market'
            ? Number(q.occupiedArea || 0)
            : leasableArea;

        pgi = rentalRate > 0 && leasableArea > 0
            ? rentalRate * leasableArea * 12
            : 0;
    }

    const occupancyRate = leasableArea > 0 ? (occupiedArea / leasableArea) * 100 : 100;
    const egi = pgi * (occupancyRate / 100);
    const opex = egi * 0.21;
    const noi = egi - opex;
    const preliminaryValue = noi > 0 ? noi / 0.10 : 0;

    const handleCalculate = async () => {
        try {
            setLoading(true);
            await api.post(`/projects/${projectId}/calculate`);
            message.success('Расчёт выполнен');
            onCalculated?.();
        } catch (error) {
            message.error(error?.response?.data?.error || 'Не удалось выполнить расчёт');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Title level={2}>
                <CalculatorOutlined /> Параметры расчета
            </Title>

            <Card style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                    <Col xs={24} sm={12}>
                        <Statistic
                            title="Ставка аренды"
                            value={rentalRate > 0 ? Math.round(rentalRate) : 0}
                            suffix="₽/м²"
                            prefix={
                                <Tag color={manualRate > 0 ? 'orange' : 'cyan'}>
                                    {manualRate > 0 ? 'Вручную' : 'Analogues'}
                                </Tag>
                            }
                        />
                    </Col>
                    <Col xs={24} sm={12}>
                        <Statistic
                            title="Источник"
                            value={rentalRateSource}
                        />
                    </Col>
                </Row>

                {derivedRate > 0 && manualRate === 0 && (
                    <Text type="secondary" style={{ marginTop: 8 }}>
                        Медианная ставка по базе analogues: {Math.round(derivedRate)} ₽/м²
                        {' '}({marketContext?.comparableCount || 0} аналогов)
                    </Text>
                )}
            </Card>

            <Card style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                    <Col xs={24} sm={8}>
                        <Statistic
                            title="Арендопригодная площадь"
                            value={leasableArea}
                            suffix="м²"
                        />
                    </Col>
                    <Col xs={24} sm={8}>
                        <Statistic
                            title="Заполняемость"
                            value={occupancyRate}
                            suffix="%"
                        />
                    </Col>
                    <Col xs={24} sm={8}>
                        <Statistic
                            title="Вакансия"
                            value={100 - occupancyRate}
                            suffix="%"
                        />
                    </Col>
                </Row>

                {q.floors && Array.isArray(q.floors) && q.floors.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                        <Text strong>Данные по этажам:</Text>
                        <div style={{ marginTop: 8 }}>
                            {q.floors.map((floor, index) => (
                                <div key={floor.id || index} style={{ marginBottom: 4 }}>
                                    <Text type="secondary">
                                        {floor.floorLocation}: {floor.name} - {floor.leasableArea} м²
                                        {floor.occupiedArea && ` (занято: ${floor.occupiedArea} м²)`}
                                    </Text>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            <Card style={{ marginBottom: 16 }}>
                <Title level={4}>Поток доходов</Title>
                <Row gutter={16}>
                    <Col xs={24} sm={12} md={6}>
                        <Card size="small" style={{ background: '#f0f5ff' }}>
                            <Statistic
                                title="PGI"
                                value={Math.round(pgi)}
                                suffix="₽"
                                valueStyle={{ fontSize: '16px' }}
                            />
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                Потенциальный доход
                            </Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Card size="small" style={{ background: '#e6f7ff' }}>
                            <Statistic
                                title="EGI"
                                value={Math.round(egi)}
                                suffix="₽"
                                valueStyle={{ fontSize: '16px' }}
                            />
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                Эффективный доход
                            </Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Card size="small" style={{ background: '#fff7e6' }}>
                            <Statistic
                                title="OPEX"
                                value={Math.round(opex)}
                                suffix="₽"
                                valueStyle={{ fontSize: '16px' }}
                            />
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                Операционные расходы (21%)
                            </Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Card size="small" style={{ background: '#f6ffed' }}>
                            <Statistic
                                title="NOI"
                                value={Math.round(noi)}
                                suffix="₽"
                                valueStyle={{ fontSize: '16px' }}
                            />
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                Чистый операционный доход
                            </Text>
                        </Card>
                    </Col>
                </Row>

                <Divider style={{ margin: '12px 0' }} />

                <Row gutter={16}>
                    <Col xs={24} sm={12}>
                        <Statistic
                            title="Предварительная стоимость"
                            value={Math.round(preliminaryValue)}
                            suffix="₽"
                        />
                    </Col>
                    <Col xs={24} sm={12}>
                        <Text type="secondary">
                            NOI / 10% = ориентировочная стоимость до вычета доли земли
                        </Text>
                    </Col>
                </Row>
            </Card>

            <Space>
                <Button onClick={onBack}>Назад</Button>
                <Button
                    type="primary"
                    loading={loading}
                    onClick={handleCalculate}
                >
                    Выполнить расчёт
                </Button>
            </Space>
        </>
    );
}