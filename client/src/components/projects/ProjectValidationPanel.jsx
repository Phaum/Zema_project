import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, InputNumber, Row, Space, Table, Typography, message } from 'antd';
import dayjs from 'dayjs';
import L from 'leaflet';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import api from '../../components/projects/api';
import { getMissingAutoBuildingFields, getQuestionnaireSourceBuckets, hasMeaningfulValue } from '../../utils/projectQuestionnaire';
import {
    buildLeafletBoundsFromAddressGeometry,
    hasRenderableAddressGeometry,
    ObjectLocationHighlight,
    useObjectGeometry,
} from './ObjectLocationHighlight';

const { Text } = Typography;
const { TextArea } = Input;

const numberInputProps = {
    className: 'full-width',
    min: 0,
};

function buildChecks(project) {
    const q = project?.questionnaire || {};

    return [
        { key: 'projectName', label: 'Название проекта', ok: Boolean(project?.name) },
        { key: 'buildingCadastralNumber', label: 'Кадастровый номер здания', ok: Boolean(q.buildingCadastralNumber) },
        { key: 'valuationDate', label: 'Дата оценки', ok: Boolean(q.valuationDate) },
        { key: 'objectAddress', label: 'Адрес объекта', ok: Boolean(q.objectAddress) },
        { key: 'totalArea', label: 'Общая площадь', ok: Number(q.totalArea) > 0 },
        { key: 'landCadastralNumber', label: 'Кадастровый номер участка', ok: Boolean(q.landCadastralNumber) },
        { key: 'landArea', label: 'Площадь участка', ok: Number(q.landArea) > 0 },
    ];
}

function renderManualField(field) {
    if (field.type === 'number') {
        return <InputNumber {...numberInputProps} placeholder={field.label} />;
    }

    if (field.type === 'textarea') {
        return <TextArea rows={3} placeholder={field.label} />;
    }

    return <Input placeholder={field.label} />;
}

function hasValidMapCoords(lat, lng) {
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function ValidationObjectMapBounds({ point, highlightBounds }) {
    const map = useMap();

    useEffect(() => {
        if (!point && !highlightBounds) {
            return undefined;
        }

        const frame = requestAnimationFrame(() => {
            map.invalidateSize();

            if (highlightBounds) {
                const nextBounds = highlightBounds.pad(0.18);

                if (point) {
                    nextBounds.extend(L.latLng(point.lat, point.lng));
                }

                map.fitBounds(nextBounds, { padding: [32, 32], animate: false });
                return;
            }

            map.setView([point.lat, point.lng], 15, { animate: false });
        });

        return () => cancelAnimationFrame(frame);
    }, [highlightBounds, map, point]);

    return null;
}

function ValidationObjectMap({ point, cadastralNumber, objectAddress }) {
    const { data: objectGeometry } = useObjectGeometry({
        address: objectAddress,
        point,
        preferPoint: true,
    });
    const highlightBounds = useMemo(
        () => buildLeafletBoundsFromAddressGeometry(objectGeometry),
        [objectGeometry]
    );
    const hasObjectGeometry = hasRenderableAddressGeometry(objectGeometry);
    const fallbackCenter = point ? [point.lat, point.lng] : [59.9386, 30.3141];

    return (
        <div className="project-validation-map-shell">
            <MapContainer
                key={point ? `${point.lat}_${point.lng}` : 'validation-map-fallback'}
                center={fallbackCenter}
                zoom={15}
                scrollWheelZoom={false}
                zoomAnimation={false}
                fadeAnimation={false}
                markerZoomAnimation={false}
                className="project-validation-map"
            >
                <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ValidationObjectMapBounds point={point} highlightBounds={highlightBounds} />
                <ObjectLocationHighlight
                    geometry={objectGeometry}
                    color="#c026d3"
                    fillColor="#d946ef"
                />

                {point && !hasObjectGeometry && (
                    <CircleMarker
                        center={[point.lat, point.lng]}
                        radius={8}
                        pathOptions={{
                            color: '#ffffff',
                            weight: 3,
                            fillColor: '#c026d3',
                            fillOpacity: 0.96,
                        }}
                    >
                        <Popup>
                            <div className="project-validation-map-popup">
                                <strong>Рассматриваемый объект</strong>
                                <div>Кадастровый номер: {cadastralNumber || '—'}</div>
                                <div>Адрес объекта: {objectAddress || '—'}</div>
                            </div>
                        </Popup>
                    </CircleMarker>
                )}
            </MapContainer>
        </div>
    );
}

export default function ProjectValidationPanel({
    projectId,
    project,
    onBack,
    onNext,
    onSaved,
}) {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const [enrichmentAttempted, setEnrichmentAttempted] = useState(false);
    const [enrichmentInfo, setEnrichmentInfo] = useState(null);
    const q = project?.questionnaire || {};
    const validationValues = Form.useWatch([], form) || {};

    useEffect(() => {
        form.setFieldsValue(q);
    }, [form, q]);

    const checks = useMemo(() => buildChecks(project), [project]);
    const missingAutoFields = useMemo(() => getMissingAutoBuildingFields(q), [q]);
    const questionnaireSourceBuckets = useMemo(() => getQuestionnaireSourceBuckets(q), [q]);

    const allRequiredFilled = checks.every((item) => item.ok);
    const missingAutoFieldsFilled = missingAutoFields.every((field) => (
        hasMeaningfulValue(validationValues[field.name])
    ));
    const canProceed = allRequiredFilled && missingAutoFieldsFilled;

    const floorRows = Array.isArray(q?.floors) ? q.floors : [];
    const objectMapPoint = useMemo(() => (
        hasValidMapCoords(q?.mapPointLat, q?.mapPointLng)
            ? {
                lat: Number(q.mapPointLat),
                lng: Number(q.mapPointLng),
            }
            : null
    ), [q?.mapPointLat, q?.mapPointLng]);

    useEffect(() => {
        let cancelled = false;

        async function enrichMissingFields() {
            if (!missingAutoFields.length || enrichmentAttempted) {
                return;
            }

            try {
                setEnriching(true);
                const { data } = await api.post(`/projects/${projectId}/questionnaire/enrich`);
                setEnrichmentInfo(data?.enrichment || null);
                const autoFilledFields = data?.enrichment?.autoFilledFields || [];

                if (!cancelled && autoFilledFields.length > 0) {
                    message.success(`Автоматически дополнено полей: ${autoFilledFields.length}`);
                    await onSaved?.();
                }
            } catch (error) {
                if (!cancelled) {
                    console.error('Не удалось автоматически дополнить анкету:', error);
                }
            } finally {
                if (!cancelled) {
                    setEnrichmentAttempted(true);
                    setEnriching(false);
                }
            }
        }

        enrichMissingFields();

        return () => {
            cancelled = true;
        };
    }, [projectId, missingAutoFields.length, enrichmentAttempted, onSaved]);

    const saveMissingAutoFields = async () => {
        if (!missingAutoFields.length) {
            return true;
        }

        try {
            setSaving(true);

            const fieldNames = missingAutoFields.map((field) => field.name);
            const values = await form.validateFields(fieldNames);
            const nextFieldSourceHints = fieldNames.reduce((accumulator, fieldName) => {
                if (hasMeaningfulValue(values[fieldName])) {
                    accumulator[fieldName] = 'manual_input';
                }
                return accumulator;
            }, { ...(q?.fieldSourceHints || {}) });

            await api.post(`/projects/${projectId}/questionnaire`, {
                ...q,
                ...values,
                fieldSourceHints: nextFieldSourceHints,
                valuationDate: q?.valuationDate
                    ? dayjs(q.valuationDate).format('YYYY-MM-DD')
                    : null,
            });

            message.success('Недостающие данные сохранены');
            await onSaved?.();
            return true;
        } catch (error) {
            if (!error?.errorFields) {
                message.error(error?.response?.data?.error || 'Не удалось сохранить данные проверки');
            }
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleNext = async () => {
        const ok = await saveMissingAutoFields();
        if (!ok) return;
        onNext?.();
    };

    return (
        <div className="project-step-shell">
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card>
                <Space direction="vertical" size={6}>
                    <Text strong>Проверка корректности данных</Text>
                    <Text>На этом шаге система проверяет, какие данные получены для расчета.</Text>
                </Space>
            </Card>

            <Card title="Положение объекта на карте">
                <Space direction="vertical" style={{ width: '100%' }} size={12}>

                    {objectMapPoint ? (
                        <>
                            <ValidationObjectMap
                                point={objectMapPoint}
                                cadastralNumber={q?.buildingCadastralNumber}
                                objectAddress={q?.objectAddress}
                            />
                            {q?.objectAddress && (
                                <Text type="secondary">
                                    Контур объекта определяется по текущей точке на карте. Адрес используется только как резервный источник, если по координатам геометрия не нашлась.
                                </Text>
                            )}
                        </>
                    ) : (
                        <Alert
                            type="warning"
                            showIcon
                            message="Координаты объекта пока не определены"
                            description="Если координаты не подтянулись автоматически, они будут повторно проверены системой. При необходимости можно вернуться в анкету и уточнить кадастровый номер."
                        />
                    )}
                </Space>
            </Card>

            {floorRows.length > 0 && (
                <Card title="Проверка данных по этажам">
                    <Table
                        size="small"
                        pagination={false}
                        rowKey={(record) => record.id}
                        dataSource={floorRows}
                        columns={[
                            {
                                title: 'Этаж',
                                dataIndex: 'floorLocation',
                                key: 'floorLocation',
                                render: (_, record) => record.floorLocation || record.name || 'Этаж',
                            },
                            {
                                title: 'Площадь, м²',
                                dataIndex: 'area',
                                key: 'area',
                            },
                            {
                                title: 'Арендопригодная площадь, м²',
                                dataIndex: 'leasableArea',
                                key: 'leasableArea',
                            },
                            {
                                title: 'Средняя площадь помещения, м²',
                                dataIndex: 'avgLeasableRoomArea',
                                key: 'avgLeasableRoomArea',
                            },
                        ]}
                    />
                </Card>
            )}

            <Card title="Проверка полей данных">
                {checks.map((item) => (
                    
                    <Alert
                        key={item.key}
                        type={item.ok ? 'success' : 'warning'}
                        showIcon
                        message={item.label}
                        description={item.ok ? 'Поле заполнено корректно' : 'Нужно заполнить в опросном листе'}
                    />
                    
                ))}
            </Card>

            {/* {enrichmentInfo && (
                <Card title="Использованные данные платформы">
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                        {(enrichmentInfo.autoFilledFields || []).length > 0 && (
                            <Alert
                                type="success"
                                showIcon
                                message={`Автоматически дополнено полей: ${enrichmentInfo.autoFilledFields.length}`}
                                description="Недостающие значения найдены автоматически и сохранены в проекте."
                            />
                        )}

                        {(enrichmentInfo.warnings || []).map((warning, index) => (
                            <Alert
                                key={`enrichment-warning-${index + 1}`}
                                type="warning"
                                showIcon
                                message={warning}
                            />
                        ))}
                    </Space>
                </Card>
            )} */}

            {missingAutoFields.length > 0 && (
                <Card title="Недостающие автоданные">
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                        {enriching && (
                            <Alert
                                type="info"
                                showIcon
                                message="Пробуем автоматически дополнить недостающие поля"
                                description="Система проверяет НСПД, кэш кадастровых данных и производные правила заполнения."
                            />
                        )}

                        <Alert
                            type="info"
                            showIcon
                            message="Часть данных отсутствует на платформе"
                            description="Заполните отсутствующие поля, чтобы они попали в расчёт."
                        />

                        <Form form={form} layout="vertical">
                            <Row gutter={16}>
                                {missingAutoFields.map((field) => (
                                    <Col
                                        key={field.name}
                                        xs={24}
                                        md={field.type === 'textarea' ? 24 : 12}
                                    >
                                        <Form.Item
                                            label={field.label}
                                            name={field.name}
                                            rules={[{ required: true, message: `Укажите: ${field.label}` }]}
                                        >
                                            {renderManualField(field)}
                                        </Form.Item>
                                    </Col>
                                ))}
                            </Row>
                        </Form>
                    </Space>
                </Card>
            )}
        </Space>

            <div className="project-step-actions">
                <div className="project-step-actions-left">
                    <Button onClick={onBack}>Назад</Button>
                </div>

                <div className="project-step-actions-right">
                    <Button type="primary" loading={saving || enriching} disabled={!canProceed || enriching} onClick={handleNext}>
                        Далее
                    </Button>
                </div>
            </div>
        </div>
    );
}
