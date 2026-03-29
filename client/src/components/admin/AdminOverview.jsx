import React, { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Skeleton, Typography } from 'antd';
import { fetchAdminOverview } from './Api';

const { Title, Text } = Typography;

export default function AdminOverview() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        async function load() {
            try {
                setLoading(true);
                setError('');
                const result = await fetchAdminOverview();
                setData(result);
            } catch (e) {
                console.error(e);
                setError(e?.response?.data?.error || 'Не удалось загрузить обзор');
            } finally {
                setLoading(false);
            }
        }

        load();
    }, []);

    if (loading) return <Skeleton active />;
    if (error) return <Alert type="error" message={error} showIcon />;

    const cards = [
        { label: 'Пользователи', value: data?.usersCount ?? 0 },
        { label: 'Проекты', value: data?.projectsCount ?? 0 },
        { label: 'Кадастровые записи', value: data?.cadastralCount ?? 0 },
        { label: 'Без координат', value: data?.recordsWithoutCoords ?? 0 },
        { label: 'Без адреса', value: data?.recordsWithoutAddress ?? 0 },
    ];

    return (
        <div>
            <Row gutter={[16, 16]}>
                {cards.map((item) => (
                    <Col xs={24} sm={12} xl={8} key={item.label}>
                        <Card>
                            <Text type="secondary">{item.label}</Text>
                            <Title level={3} style={{ marginTop: 8, marginBottom: 0 }}>
                                {item.value}
                            </Title>
                        </Card>
                    </Col>
                ))}
            </Row>
        </div>
    );
}