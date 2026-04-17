import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, message } from 'antd';
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createAdminSpatialZone, updateAdminSpatialZone } from './Api';
import { useMap } from 'react-leaflet';

const markerIcon = new L.Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

const DEFAULT_CENTER = [59.9386, 30.3141];

function MapClickCollector({ onAddPoint }) {
    useMapEvents({
        click(e) {
            onAddPoint([Number(e.latlng.lat.toFixed(8)), Number(e.latlng.lng.toFixed(8))]);
        },
    });
    return null;
}

function featureCollectionFromPoints(points) {
    if (!Array.isArray(points) || points.length < 3) {
        return null;
    }

    const coordinates = points.map(([lat, lng]) => [lng, lat]);
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];

    const closed = first[0] === last[0] && first[1] === last[1]
        ? coordinates
        : [...coordinates, first];

    return {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Polygon',
                    coordinates: [closed],
                },
            },
        ],
    };
}

function pointsFromFeatureCollection(fc) {
    const coords = fc?.features?.[0]?.geometry?.coordinates?.[0];
    if (!Array.isArray(coords) || coords.length < 4) return [];

    const withoutClosing = coords.slice(0, -1);
    return withoutClosing.map(([lng, lat]) => [Number(lat), Number(lng)]);
}

export default function SpatialZoneEditorModal({ open, initialValue, onCancel, onSaved }) {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const [points, setPoints] = useState([]);

    useEffect(() => {
        if (!open) return;

        form.setFieldsValue({
            name: initialValue?.name || '',
            zoneType: initialValue?.zone_type || 'historical_center',
            code: initialValue?.code || '',
            priority: Number.isFinite(Number(initialValue?.priority)) ? Number(initialValue.priority) : 0,
            color: initialValue?.color || '#1890ff',
            description: initialValue?.description || '',
            isActive: initialValue?.is_active ?? true,
        });

        setPoints(initialValue?.geojson ? pointsFromFeatureCollection(initialValue.geojson) : []);
    }, [open, initialValue, form]);

    const polygonPositions = useMemo(() => points, [points]);

    const handleSave = async () => {
        try {
            const values = await form.validateFields();

            const geojson = featureCollectionFromPoints(points);
            if (!geojson) {
                message.error('Нужно поставить минимум 3 точки полигона');
                return;
            }

            setSaving(true);

            const payload = {
                name: values.name,
                zoneType: values.zoneType,
                code: values.code,
                priority: values.priority,
                color: values.color,
                description: values.description,
                isActive: values.isActive,
                geojson,
            };

            if (initialValue?.id) {
                await updateAdminSpatialZone(initialValue.id, payload);
                message.success('Полигон обновлён');
            } else {
                await createAdminSpatialZone(payload);
                message.success('Полигон создан');
            }

            onSaved?.();
        } catch (error) {
            if (!error?.errorFields) {
                message.error(error?.response?.data?.error || 'Не удалось сохранить полигон');
            }
        } finally {
            setSaving(false);
        }
    };

    function MapResizer({ center }) {
        const map = useMap();

        useEffect(() => {
            setTimeout(() => {
                map.invalidateSize();
                if (center) {
                    map.setView(center);
                }
            }, 200);
        }, [map, center]);

        return null;
    }

    return (
        <Modal
            open={open}
            title={initialValue?.id ? 'Редактирование полигона' : 'Создание полигона'}
            onCancel={onCancel}
            onOk={handleSave}
            confirmLoading={saving}
            width={1100}
            destroyOnClose
        >
            <Row gutter={16}>
                <Col span={8}>
                    <Form form={form} layout="vertical">
                        <Form.Item
                            label="Название"
                            name="name"
                            rules={[{ required: true, message: 'Введите название' }]}
                        >
                            <Input />
                        </Form.Item>

                        <Form.Item
                            label="Тип зоны"
                            name="zoneType"
                            rules={[{ required: true, message: 'Выберите тип зоны' }]}
                        >
                            <Select
                                options={[
                                    { value: 'historical_center', label: 'Исторический центр' },
                                    { value: 'administrative_zone', label: 'Административная зона' },
                                    { value: 'custom_market_zone', label: 'Пользовательская рыночная зона' },
                                    { value: 'valuation_district', label: 'Оценочная зона' },
                                ]}
                            />
                        </Form.Item>

                        <Form.Item
                            label="Код зоны"
                            name="code"
                            extra="Стабильный код, который можно использовать в расчётах и фильтрации."
                        >
                            <Input placeholder="Например: ADM_MOSKOVSKIY" />
                        </Form.Item>

                        <Form.Item
                            label="Приоритет"
                            name="priority"
                            extra="Если полигоны пересекаются, выбирается зона с большим приоритетом."
                        >
                            <InputNumber className="full-width" min={0} placeholder="0" />
                        </Form.Item>

                        <Form.Item label="Цвет" name="color">
                            <Input placeholder="#1890ff" />
                        </Form.Item>

                        <Form.Item label="Описание" name="description">
                            <Input.TextArea rows={4} />
                        </Form.Item>

                        <Form.Item label="Активна" name="isActive" valuePropName="checked">
                            <Switch className="admin-rounded-switch" />
                        </Form.Item>

                        <Alert
                            type="info"
                            showIcon
                            message="Как рисовать"
                            description="Кликайте по карте, чтобы поставить вершины полигона. Минимум 3 точки."
                        />

                        <Space style={{ marginTop: 16 }} wrap>
                            <Button onClick={() => setPoints([])}>Очистить</Button>
                            <Button
                                onClick={() => {
                                    if (points.length > 0) {
                                        setPoints((prev) => prev.slice(0, -1));
                                    }
                                }}
                            >
                                Удалить последнюю точку
                            </Button>
                        </Space>
                    </Form>
                </Col>

                <Col span={16}>
                    <div style={{ height: 520, border: '1px solid #f0f0f0' }}>
                        <MapContainer
                            center={polygonPositions[0] || DEFAULT_CENTER}
                            zoom={11}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <MapResizer center={polygonPositions[0] || DEFAULT_CENTER} />
                            <TileLayer
                                attribution="&copy; OpenStreetMap contributors"
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />

                            <MapClickCollector
                                onAddPoint={(point) => setPoints((prev) => [...prev, point])}
                            />

                            {points.map((point, index) => (
                                <Marker
                                    key={`${point[0]}-${point[1]}-${index}`}
                                    position={point}
                                    draggable
                                    icon={markerIcon}
                                    eventHandlers={{
                                        dragend: (e) => {
                                            const latlng = e.target.getLatLng();
                                            setPoints((prev) =>
                                                prev.map((item, i) =>
                                                    i === index
                                                        ? [
                                                            Number(latlng.lat.toFixed(8)),
                                                            Number(latlng.lng.toFixed(8)),
                                                        ]
                                                        : item
                                                )
                                            );
                                        },
                                    }}
                                />
                            ))}

                            {polygonPositions.length >= 3 ? (
                                <Polygon positions={polygonPositions} pathOptions={{ color: form.getFieldValue('color') || '#1890ff' }} />
                            ) : null}
                        </MapContainer>
                    </div>
                </Col>
            </Row>
        </Modal>
    );
}
