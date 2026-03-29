import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
    Alert,
    Button,
    Card,
    Col,
    DatePicker,
    Divider,
    Form,
    Input,
    InputNumber,
    Modal,
    Radio,
    Row,
    Select,
    Space,
    Spin,
    Statistic,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    DatabaseOutlined,
    EnvironmentOutlined,
    ReloadOutlined,
    SaveOutlined,
    DeleteOutlined,
    PlusOutlined,
    EyeOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import MapPickerModal from './MapPickerModal/MapPickerModal';
import './QuestionnairePanel.css';
import {
    buildGeneratedFloorTemplates,
    buildQuestionnaireFormValues,
    formatQuestionnaireFieldSourceLabel,
    getQuestionnaireSourceBuckets,
    normalizeObjectTypeValue,
    normalizeQuestionnaireFieldSourceHints,
} from '../utils/projectQuestionnaire';
import { useAuth } from '../context/AuthContext';
import { api } from '../shared/api';
import { normalizeUserSettings } from '../shared/userSettings';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

const CADASTRAL_REGEX = /^\d{2}:\d{2}:\d{7}:\d{1,16}$/;

const CALCULATION_OPTIONS = [
    { value: 'market', label: 'По рыночным данным' },
    {
        value: 'actual_market',
        label: 'По фактическим данным с учетом рыночных данных',
    },
];

const BUILDING_TYPE_OPTIONS = [
    { value: 'business_center', label: 'Бизнес-центр' },
    { value: 'administrative_building', label: 'Административное здание' },
    { value: 'shopping_center', label: 'Торговый центр' },
    { value: 'shopping_entertainment_complex', label: 'Торгово-развлекательный комплекс' },
];

const BC_CLASS_OPTIONS = [
    { value: 'A+', label: 'А+' },
    { value: 'A', label: 'А' },
    { value: 'B+', label: 'В+' },
    { value: 'B', label: 'В' },
    { value: 'C', label: 'С' },
    { value: 'unknown', label: 'Не знаю' },
];

const OBJECT_TYPE_OPTIONS = [
    { value: 'здание', label: 'Здание' },
    { value: 'помещение', label: 'Помещение' },
];

const YES_NO_OPTIONS = [
    { value: 'yes', label: 'Да' },
    { value: 'no', label: 'Нет' },
];

const decimalParser = (value) => {
    if (value === null || value === undefined) return null;
    const normalized = String(value)
        .replace(/\s/g, '')
        .replace(',', '.')
        .replace(/[^0-9.-]/g, '');
    return normalized === '' ? null : Number(normalized);
};

const sqmInputProps = {
    min: 0,
    step: 0.01,
    parser: decimalParser,
    className: 'full-width',
};

const SOURCE_HINT_IGNORED_FIELDS = new Set([
    'fieldSourceHints',
    'floors',
    'nspdBuildingLoaded',
    'nspdLandLoaded',
    'addressConfirmed',
]);

const PLATFORM_AUTOFILL_FIELDS = new Set([
    'objectType',
    'actualUse',
    'businessCenterClass',
    'marketClassResolved',
    'averageRentalRate',
    'mapPointLat',
    'mapPointLng',
    'objectAddress',
    'totalArea',
    'constructionYear',
    'district',
    'nearestMetro',
    'metroDistance',
    'cadCost',
    'permittedUse',
    'landCadastralNumber',
    'landArea',
    'landCadCost',
    'totalOksAreaOnLand',
    'leasableArea',
    'occupiedArea',
]);

const QUESTIONNAIRE_SECTION_HINTS = {
    overview: {
        title: 'Как лучше пройти анкету',
        items: [
            'Начните с кадастрового номера здания: система попытается заполнить адрес, площадь, координаты и часть рыночных данных автоматически.',
            'Проверьте дату оценки и класс объекта до перехода к расчету: эти поля сильнее всего влияют на подбор аналогов и ставку.',
            'Данные по этажам нужны для доходного подхода: по ним считаются ставки, ПВД и итоговая стоимость.',
        ],
    },
    basic: {
        title: 'Что важно в основных сведениях',
        items: [
            'Способ расчета влияет на набор обязательных полей и логику доходной модели.',
            'Название проекта попадет в итоговые результаты и экспорт.',
        ],
    },
    building: {
        title: 'Как работает блок здания',
        items: [
            'После ввода кадастрового номера используйте автозаполнение: система ищет данные в НСПД, кадастровом кэше и рыночной базе.',
            'Если класс БЦ неизвестен, можно ввести рыночную ставку и определить ближайший класс автоматически.',
        ],
    },
    location: {
        title: 'Зачем нужны координаты и адрес',
        items: [
            'Координаты помогают определить район, метро, исторический центр и окружение.',
            'Если точка подтянулась неверно, ее можно скорректировать вручную через карту.',
        ],
    },
    buildingParams: {
        title: 'Что влияет на параметры здания',
        items: [
            'Площадь, год постройки и этажность участвуют в подборе аналогов и в расчетных коэффициентах.',
            'Для режима фактических данных дополнительно используются арендопригодная и занятая площадь.',
        ],
    },
    floors: {
        title: 'Как заполнять этажи',
        items: [
            'Список этажей создается автоматически по надземным, подземным и цокольному этажу.',
            'Если есть нестандартные этажные группы, их можно добавить вручную ниже.',
        ],
    },
    land: {
        title: 'Что проверять по участку',
        items: [
            'По кадастровому номеру участка система добирает стоимость и другие доступные данные автоматически.',
            'Общая площадь всех ОКС на участке нужна для доли земли в итоговой стоимости, если она доступна.',
        ],
    },
};

function normalizeAddressText(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function scoreAddressSpecificity(value) {
    const normalized = normalizeAddressText(value).toLowerCase();

    if (!normalized) return 0;

    let score = 0;

    score += Math.min(normalized.length / 20, 5);
    score += normalized.split(',').filter(Boolean).length;

    if (/\b(улиц|просп|пер|проезд|наб|шоссе|бульвар|дорога|аллея)\b/.test(normalized)) {
        score += 3;
    }

    if (/\b(дом|д\.|корп|к\.|строен|стр\.|лит|пом)\b/.test(normalized)) {
        score += 3;
    }

    if (/\d/.test(normalized)) {
        score += 2;
    }

    if (/россия,\s*санкт-петербург$/.test(normalized)) {
        score -= 4;
    }

    return score;
}

function chooseMoreSpecificAddress(currentAddress, nextAddress) {
    const current = normalizeAddressText(currentAddress);
    const next = normalizeAddressText(nextAddress);

    if (!next) return current;
    if (!current) return next;

    return scoreAddressSpecificity(next) > scoreAddressSpecificity(current)
        ? next
        : current;
}

function roundAreaValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Number(numeric.toFixed(2));
}

function hasNumericAreaValue(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function formatAreaSourceLabel(source) {
    return formatQuestionnaireFieldSourceLabel(source);
}

function areSourceHintsEqual(left = {}, right = {}) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
        return false;
    }

    return leftKeys.every((key) => left[key] === right[key]);
}

function mergeGeneratedFloorsWithCurrent(generatedTemplates, currentFloors = []) {
    const currentById = new Map(
        (Array.isArray(currentFloors) ? currentFloors : []).map((floor) => [String(floor.id), floor])
    );

    const generatedIds = new Set(generatedTemplates.map((floor) => String(floor.id)));

    const mergedGenerated = generatedTemplates.map((template) => {
        const existing = currentById.get(String(template.id));

        if (!existing) {
            return template;
        }

        return {
            ...existing,
            ...template,
            area: existing.area ?? 0,
            leasableArea: existing.leasableArea ?? 0,
            avgLeasableRoomArea: existing.avgLeasableRoomArea ?? 0,
            occupiedArea: existing.occupiedArea ?? 0,
            isGenerated: true,
        };
    });

    const manualFloors = (Array.isArray(currentFloors) ? currentFloors : []).filter((floor) => {
        const id = String(floor.id);
        return !generatedIds.has(id) && floor.isGenerated !== true;
    });

    return [...mergedGenerated, ...manualFloors];
}

function QuestionnaireHintPanel({ title, items, compact = false }) {
    if (!Array.isArray(items) || items.length === 0) {
        return null;
    }

    return (
        <div className={`questionnaire-hint-panel ${compact ? 'is-compact' : ''}`}>
            <div className="questionnaire-hint-title">
                <InfoCircleOutlined />
                <span>{title}</span>
            </div>

            <div className="questionnaire-hint-list">
                {items.map((item) => (
                    <div key={item} className="questionnaire-hint-item">
                        {item}
                    </div>
                ))}
            </div>
        </div>
    );
}

const FloorDataSection = ({ form, onFloorsChange, showHints }) => {
    const aboveGroundFloors = Form.useWatch('aboveGroundFloors', form) || 0;
    const undergroundFloors = Form.useWatch('undergroundFloors', form) || 0;
    const hasBasementFloor = Form.useWatch('hasBasementFloor', form) || 'no';
    const watchedFloors = Form.useWatch('floors', form);

    const floors = Array.isArray(watchedFloors) ? watchedFloors : [];

    useEffect(() => {
        const currentFloors = Array.isArray(form.getFieldValue('floors'))
            ? form.getFieldValue('floors')
            : [];

        const generatedTemplates = buildGeneratedFloorTemplates({
            aboveGroundFloors,
            undergroundFloors,
            hasBasementFloor,
        });

        const mergedFloors = mergeGeneratedFloorsWithCurrent(
            generatedTemplates,
            currentFloors
        );

        const currentSerialized = JSON.stringify(currentFloors);
        const nextSerialized = JSON.stringify(mergedFloors);

        if (currentSerialized !== nextSerialized) {
            form.setFieldsValue({ floors: mergedFloors });
        }

        onFloorsChange?.(mergedFloors);
    }, [
        aboveGroundFloors,
        undergroundFloors,
        hasBasementFloor,
        form,
        onFloorsChange,
    ]);

    const addFloor = () => {
        const currentFloors = Array.isArray(form.getFieldValue('floors'))
            ? form.getFieldValue('floors')
            : [];

        const newFloor = {
            id: `manual_${Date.now()}`,
            floorLocation: '',
            name: '',
            floorCategory: 'third_plus',
            area: 0,
            leasableArea: 0,
            avgLeasableRoomArea: 0,
            occupiedArea: 0,
            isGenerated: false,
        };

        const updatedFloors = [...currentFloors, newFloor];
        form.setFieldsValue({ floors: updatedFloors });
        onFloorsChange?.(updatedFloors);
    };

    const removeFloor = (floorId) => {
        const currentFloors = Array.isArray(form.getFieldValue('floors'))
            ? form.getFieldValue('floors')
            : [];

        const updatedFloors = currentFloors.filter((floor) => floor.id !== floorId);
        form.setFieldsValue({ floors: updatedFloors });
        onFloorsChange?.(updatedFloors);
    };

    const updateFloor = (floorId, field, value) => {
        const currentFloors = Array.isArray(form.getFieldValue('floors'))
            ? form.getFieldValue('floors')
            : [];

        const updatedFloors = currentFloors.map((floor) =>
            floor.id === floorId ? { ...floor, [field]: value } : floor
        );

        form.setFieldsValue({ floors: updatedFloors });
        onFloorsChange?.(updatedFloors);
    };

    return (
        <div>
            {showHints && (
                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                    {floors.length === 0
                        ? 'Укажите количество надземных и подземных этажей, а также наличие цокольного этажа. Этажи будут созданы автоматически.'
                        : `Сформировано ${floors.length} этаж(ей). Заполните данные по каждому этажу.`}
                </Paragraph>
            )}

            {floors.map((floor, index) => (
                <Card
                    key={floor.id}
                    size="small"
                    className="questionnaire-floor-card"
                    style={{ marginBottom: 16 }}
                    title={<span>{index + 1}. {floor.floorLocation || floor.name || 'Этаж'}</span>}
                    extra={
                        !floor.isGenerated && (
                            <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => removeFloor(floor.id)}
                            >
                                Удалить
                            </Button>
                        )
                    }
                >
                    <Row gutter={[16, 16]} className="questionnaire-floor-row">
                        <Col xs={24} sm={12} md={24} lg={8}>
                            <Form.Item
                                className="questionnaire-floor-item"
                                label="Площадь, м²"
                                rules={[{ required: true, message: 'Укажите площадь' }]}
                            >
                                <InputNumber
                                    {...sqmInputProps}
                                    placeholder="Введите площадь"
                                    value={floor.area}
                                    onChange={(value) => updateFloor(floor.id, 'area', value)}
                                />
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12} md={24} lg={8}>
                            <Form.Item
                                className="questionnaire-floor-item"
                                label="Арендопригодная площадь, м²"
                                rules={[{ required: true, message: 'Укажите арендопригодную площадь' }]}
                            >
                                <InputNumber
                                    {...sqmInputProps}
                                    placeholder="Введите арендопригодную площадь"
                                    value={floor.leasableArea}
                                    onChange={(value) => updateFloor(floor.id, 'leasableArea', value)}
                                />
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12} md={24} lg={8}>
                            <Form.Item
                                className="questionnaire-floor-item"
                                label="Средняя площадь помещения, м²"
                            >
                                <InputNumber
                                    {...sqmInputProps}
                                    placeholder="Введите среднюю площадь"
                                    value={floor.avgLeasableRoomArea}
                                    onChange={(value) => updateFloor(floor.id, 'avgLeasableRoomArea', value)}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>
            ))}

            {showHints && floors.length === 0 && (
                <Alert
                    type="info"
                    message="Данные по этажам не указаны"
                    description="Укажите количество надземных этажей, подземных этажей и наличие цокольного этажа. После этого список этажей создастся автоматически."
                    style={{ marginTop: 16 }}
                />
            )}

            {/* <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={addFloor}
                style={{ width: '100%', marginTop: 16 }}
            >
                Добавить дополнительный этаж
            </Button> */}
        </div>
    );
};

const VerificationSection = ({ formValues, floors, onClose }) => {
    const sourceBuckets = useMemo(() => getQuestionnaireSourceBuckets(formValues), [formValues]);
    const manualFields = sourceBuckets.manualFields;
    const autoFields = sourceBuckets.autoFields;
    const analytics = useMemo(() => {
        const totalLeasable = (Array.isArray(floors) ? floors : []).reduce(
            (sum, floor) => sum + (Number(floor?.leasableArea) || 0),
            0
        );
        const avgRoomArea = (Array.isArray(floors) ? floors : []).length > 0
            ? (Array.isArray(floors) ? floors : []).reduce(
                (sum, floor) => sum + (Number(floor?.avgLeasableRoomArea) || 0),
                0
            ) / floors.length
            : 0;

        return {
            totalFloors: Array.isArray(floors) ? floors.length : 0,
            totalLeasable,
            avgRoomArea,
        };
    }, [floors]);

    const getValue = (value, defaultText = 'не указано') => {
        if (value === null || value === undefined || value === '') {
            return <Text type="secondary">{defaultText}</Text>;
        }
        return String(value);
    };

    const formatNumber = (value) => {
        if (value === null || value === undefined || value === '') return getValue(null);
        return new Intl.NumberFormat('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(value);
    };

    const renderEntryValue = (entry) => {
        if (!entry) return getValue(null);

        if (entry.type === 'date') {
            return dayjs(entry.value).isValid() ? dayjs(entry.value).format('DD.MM.YYYY') : getValue(entry.value);
        }

        if (entry.type === 'area') {
            return `${formatNumber(entry.value)} м²`;
        }

        if (entry.type === 'distance') {
            return `${formatNumber(entry.value)} м`;
        }

        if (entry.type === 'currency') {
            return `${formatNumber(entry.value)} ₽`;
        }

        if (entry.type === 'yesno') {
            return entry.value === 'yes' || entry.value === true ? 'Да' : entry.value === 'no' || entry.value === false ? 'Нет' : getValue(entry.value);
        }

        return getValue(entry.value);
    };

    const floorsColumns = [
        {
            title: 'Этаж',
            dataIndex: 'name',
            key: 'name',
            width: 120,
            render: (_, record) => record.name || record.floorLocation || '-',
        },
        {
            title: 'Площадь, м²',
            dataIndex: 'area',
            key: 'area',
            render: (value) => formatNumber(value),
            width: 150,
        },
        {
            title: 'Арендопригодная площадь, м²',
            dataIndex: 'leasableArea',
            key: 'leasableArea',
            render: (value) => formatNumber(value),
            width: 180,
        },
        {
            title: 'Средняя площадь помещения, м²',
            dataIndex: 'avgLeasableRoomArea',
            key: 'avgLeasableRoomArea',
            render: (value) => formatNumber(value),
            width: 180,
        },
    ];

    return (
        <Modal
            title="Проверка введенных данных"
            width="90%"
            style={{ maxWidth: 1200 }}
            open
            onCancel={onClose}
            footer={[
                <Button key="close" onClick={onClose}>
                    Закрыть
                </Button>,
            ]}
        >
            <Spin spinning={false}>
                <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    <Alert
                        type="info"
                        message="До результата в проверке показываются только ручные поля и статусы автозаполнения"
                        description="Подтянутые платформой значения участвуют в расчёте, но не раскрываются до этапа результата."
                        showIcon
                        style={{ marginBottom: 16 }}
                    />

                    <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                        <Title level={5}>📊 Аналитика ручного ввода</Title>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} sm={12} md={8}>
                                <Card size="small" style={{ textAlign: 'center', background: '#fff' }}>
                                    <Statistic title="Этажных строк" value={analytics.totalFloors || 'н/д'} />
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} md={8}>
                                <Card size="small" style={{ textAlign: 'center', background: '#fff' }}>
                                    <Statistic
                                        title="Сумма по этажам"
                                        value={analytics.totalLeasable ? formatNumber(analytics.totalLeasable) : 'н/д'}
                                        suffix={analytics.totalLeasable ? 'м²' : ''}
                                    />
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} md={8}>
                                <Card size="small" style={{ textAlign: 'center', background: '#fff' }}>
                                    <Statistic
                                        title="Средняя площадь помещения"
                                        value={analytics.avgRoomArea ? formatNumber(analytics.avgRoomArea) : 'н/д'}
                                        suffix={analytics.avgRoomArea ? 'м²' : ''}
                                    />
                                </Card>
                            </Col>
                        </Row>
                    </Card>

                    <Card size="small" style={{ marginBottom: 16 }}>
                        <Title level={5}>1. Введено вручную</Title>
                        {manualFields.length > 0 ? (
                            <Row gutter={[20, 16]}>
                                {manualFields.map((field) => (
                                    <Col key={field.name} xs={24} sm={12}>
                                        <div>
                                            <Text strong>{field.label}:</Text>
                                            <div style={{ whiteSpace: field.type === 'textarea' ? 'pre-wrap' : 'normal' }}>
                                                {renderEntryValue(field)}
                                            </div>
                                        </div>
                                    </Col>
                                ))}
                            </Row>
                        ) : (
                            <Text type="secondary">Ручные поля пока не заполнены.</Text>
                        )}
                    </Card>

                    <Card size="small" style={{ marginBottom: 16 }}>
                        <Title level={5}>2. Статус автозаполнения</Title>
                        {autoFields.length > 0 ? (
                            <Space wrap>
                                {autoFields.map((field) => (
                                    <Tag key={`${field.name}_${field.fieldName}`} color="cyan">
                                        {field.label}: определено автоматически
                                    </Tag>
                                ))}
                            </Space>
                        ) : (
                            <Text type="secondary">Автоматически определённые поля пока отсутствуют.</Text>
                        )}
                    </Card>

                    {floors && floors.length > 0 && (
                        <Card size="small" style={{ marginBottom: 16 }}>
                            <Title level={5}>3. Данные по этажам</Title>
                            <Table
                                columns={floorsColumns}
                                dataSource={floors}
                                rowKey="id"
                                pagination={false}
                                size="small"
                                scroll={{ x: true }}
                            />
                        </Card>
                    )}
                </div>
            </Spin>
        </Modal>
    );
};

export default function QuestionnairePanel({
                                               projectId,
                                               form,
                                               questionnaireLoading,
                                               questionnaireSaving,
                                               questionnaireStatus,
                                               persistDraftLocally,
                                               saveQuestionnaire,
                                               clearQuestionnaire,
                                               onGoNext,
                                           }) {
    const { settings } = useAuth();
    const [buildingLoading, setBuildingLoading] = useState(false);
    const [mapPickerOpen, setMapPickerOpen] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [verificationOpen, setVerificationOpen] = useState(false);

    const calculationMethod = Form.useWatch('calculationMethod', form);
    const selectedObjectType = Form.useWatch('objectType', form);
    const selectedBcClass = Form.useWatch('businessCenterClass', form);
    const marketClassResolved = Form.useWatch('marketClassResolved', form);
    const latWatch = Form.useWatch('mapPointLat', form);
    const lngWatch = Form.useWatch('mapPointLng', form);
    const leasableAreaWatch = Form.useWatch('leasableArea', form);
    const watchedFloors = Form.useWatch('floors', form);
    const userSettings = useMemo(() => normalizeUserSettings(settings), [settings]);

    const showActualDataFields = calculationMethod === 'actual_market';
    const showQuestionnaireHints = userSettings.showQuestionnaireHints;
    const compactQuestionnaire = userSettings.compactMode;
    const showRentalRateField = selectedBcClass === 'unknown';
    const normalizedObjectType = normalizeObjectTypeValue(selectedObjectType);
    const reverseGeocodeTimerRef = useRef(null);
    const lastLoadedBuildingCadRef = useRef('');
    const sourceSyncInProgressRef = useRef(false);
    const floorsDataRef = useRef([]);
    const [fieldSourceHintsState, setFieldSourceHintsState] = useState({});
    const [acceptedAreaMismatchKey, setAcceptedAreaMismatchKey] = useState(null);
    const [formSnapshot, setFormSnapshot] = useState({});
    const areaSourceHints = useMemo(() => ({
        leasableArea: fieldSourceHintsState.leasableArea || null,
        occupiedArea: fieldSourceHintsState.occupiedArea || null,
    }), [fieldSourceHintsState]);
    const questionnaireSourceBuckets = useMemo(() => getQuestionnaireSourceBuckets({
        ...formSnapshot,
        fieldSourceHints: fieldSourceHintsState,
    }), [fieldSourceHintsState, formSnapshot]);
    const hiddenPlatformFieldNames = useMemo(() => new Set(
        questionnaireSourceBuckets.autoFields.flatMap((field) => (
            [field.name, field.fieldName].filter((fieldName) => PLATFORM_AUTOFILL_FIELDS.has(fieldName))
        ))
    ), [questionnaireSourceBuckets.autoFields]);
    const hiddenPlatformFieldCount = questionnaireSourceBuckets.autoFields.filter((field) => (
        PLATFORM_AUTOFILL_FIELDS.has(field.name) || PLATFORM_AUTOFILL_FIELDS.has(field.fieldName)
    )).length;
    const shouldShowDynamicField = (fieldName) => !hiddenPlatformFieldNames.has(fieldName);
    const showBuildingSubtypeField = normalizedObjectType === 'здание' && shouldShowDynamicField('actualUse');
    const showLocationSection = shouldShowDynamicField('mapPointLat')
        || shouldShowDynamicField('mapPointLng')
        || shouldShowDynamicField('objectAddress');
    useEffect(() => {
        const nextHints = normalizeQuestionnaireFieldSourceHints(
            form.getFieldValue('fieldSourceHints')
        );
        const nextSnapshot = form.getFieldsValue(true);

        setFieldSourceHintsState((prev) => (
            areSourceHintsEqual(prev, nextHints) ? prev : nextHints
        ));
        setFormSnapshot(nextSnapshot);
    }, [form, questionnaireLoading]);

    useEffect(() => {
        const currentObjectType = form.getFieldValue('objectType');

        if (currentObjectType !== normalizedObjectType) {
            form.setFieldValue('objectType', normalizedObjectType);
        }

        if (normalizedObjectType === 'здание') {
            return;
        }

        if (form.getFieldValue('actualUse') !== undefined) {
            form.setFieldValue('actualUse', undefined);
        }

        setFieldSourceHintsState((prev) => {
            if (!prev?.actualUse) {
                return prev;
            }

            const next = { ...prev };
            delete next.actualUse;
            form.setFieldValue('fieldSourceHints', next);
            return next;
        });
    }, [form, normalizedObjectType]);

    const applyFormPatch = (
        values = {},
        { sourceUpdates = null, replaceSourceHints = null, persist = true, markDirty = true } = {}
    ) => {
        const payload = { ...values };
        let nextSourceHints = fieldSourceHintsState;

        if (replaceSourceHints !== null) {
            nextSourceHints = normalizeQuestionnaireFieldSourceHints(replaceSourceHints);
            payload.fieldSourceHints = nextSourceHints;
        } else if (sourceUpdates && Object.keys(sourceUpdates).length > 0) {
            nextSourceHints = {
                ...fieldSourceHintsState,
                ...normalizeQuestionnaireFieldSourceHints(sourceUpdates),
            };
            payload.fieldSourceHints = nextSourceHints;
        }

        sourceSyncInProgressRef.current = true;
        form.setFieldsValue(payload);
        Promise.resolve().then(() => {
            sourceSyncInProgressRef.current = false;
        });

        if (payload.fieldSourceHints) {
            setFieldSourceHintsState(nextSourceHints);
        }

        const persistedValues = {
            ...form.getFieldsValue(true),
            ...payload,
            fieldSourceHints: nextSourceHints,
        };

        setFormSnapshot(persistedValues);

        if (persist) {
            persistDraftLocally(persistedValues);
        }

        if (markDirty) {
            setIsSaved(false);
        }
    };

    useEffect(() => {
        const lat = Number(latWatch);
        const lng = Number(lngWatch);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        if (reverseGeocodeTimerRef.current) {
            clearTimeout(reverseGeocodeTimerRef.current);
        }

        reverseGeocodeTimerRef.current = setTimeout(async () => {
            try {
                const { data } = await api.get('/geo/reverse', {
                    params: { lat, lng },
                });

                const currentAddress = normalizeAddressText(form.getFieldValue('objectAddress'));
                const reverseAddress = data?.address || data?.displayName || '';
                const selectedAddress = chooseMoreSpecificAddress(currentAddress, reverseAddress);

                if (
                    normalizeAddressText(selectedAddress) === currentAddress &&
                    form.getFieldValue('addressConfirmed') === Boolean(selectedAddress)
                ) {
                    return;
                }

                applyFormPatch(
                    {
                        objectAddress: selectedAddress,
                        addressConfirmed: Boolean(selectedAddress),
                    },
                    {
                        sourceUpdates: selectedAddress !== currentAddress
                            ? { objectAddress: 'reverse_geocode' }
                            : null,
                    }
                );
            } catch (error) {
                console.error('Ошибка reverse geocoding из формы:', error);
            }
        }, 500);

        return () => {
            if (reverseGeocodeTimerRef.current) {
                clearTimeout(reverseGeocodeTimerRef.current);
            }
        };
    }, [latWatch, lngWatch, form]);

    const currentPoint = useMemo(() => {
        if (
            latWatch === undefined ||
            latWatch === null ||
            lngWatch === undefined ||
            lngWatch === null
        ) {
            return null;
        }

        return {
            lat: Number(latWatch),
            lng: Number(lngWatch),
        };
    }, [latWatch, lngWatch]);

    const floorAreaComparison = useMemo(() => {
        const floors = Array.isArray(watchedFloors) ? watchedFloors : [];
        const leasableSum = roundAreaValue(
            floors.reduce((sum, floor) => sum + (Number(floor?.leasableArea) || 0), 0)
        );
        const hasFloorAreaValues = floors.some((floor) => Number(floor?.leasableArea) > 0);
        const currentLeasable = hasNumericAreaValue(leasableAreaWatch)
            ? roundAreaValue(leasableAreaWatch)
            : null;
        const leasableMismatch = hasFloorAreaValues && currentLeasable !== null && leasableSum !== null
            ? Math.abs(currentLeasable - leasableSum) > 0.01
            : false;
        const canRecalculate = hasFloorAreaValues && leasableSum !== null;
        const needsInitialFill = canRecalculate && currentLeasable === null;
        const signature = [
            currentLeasable ?? 'null',
            leasableSum ?? 'null',
        ].join('|');

        return {
            currentLeasable,
            leasableSum,
            hasFloorAreaValues,
            canRecalculate,
            needsInitialFill,
            hasMismatch: leasableMismatch,
            leasableMismatch,
            signature,
        };
    }, [watchedFloors, leasableAreaWatch]);

    useEffect(() => {
        if (!floorAreaComparison.hasMismatch) {
            setAcceptedAreaMismatchKey(null);
            return;
        }

        if (acceptedAreaMismatchKey && acceptedAreaMismatchKey !== floorAreaComparison.signature) {
            setAcceptedAreaMismatchKey(null);
        }
    }, [acceptedAreaMismatchKey, floorAreaComparison.hasMismatch, floorAreaComparison.signature]);

    const handleValuesChange = (changedValues, allValues) => {
        if (sourceSyncInProgressRef.current) {
            setFormSnapshot(allValues);
            persistDraftLocally(allValues);
            setIsSaved(false);
            return;
        }

        const manuallyChangedFields = Object.keys(changedValues || {}).filter(
            (fieldName) => !SOURCE_HINT_IGNORED_FIELDS.has(fieldName)
        );

        if (!manuallyChangedFields.length) {
            setFormSnapshot(allValues);
            persistDraftLocally(allValues);
            setIsSaved(false);
            return;
        }

        const manualSourceUpdates = manuallyChangedFields.reduce((accumulator, fieldName) => {
            accumulator[fieldName] = 'manual_input';
            return accumulator;
        }, {});

        const nextSourceHints = {
            ...fieldSourceHintsState,
            ...manualSourceUpdates,
        };

        if (areSourceHintsEqual(fieldSourceHintsState, nextSourceHints)) {
            setFormSnapshot({
                ...allValues,
                fieldSourceHints: fieldSourceHintsState,
            });
            persistDraftLocally({
                ...allValues,
                fieldSourceHints: fieldSourceHintsState,
            });
            setIsSaved(false);
            return;
        }

        sourceSyncInProgressRef.current = true;
        form.setFieldsValue({ fieldSourceHints: nextSourceHints });
        Promise.resolve().then(() => {
            sourceSyncInProgressRef.current = false;
        });

        setFieldSourceHintsState(nextSourceHints);
        setFormSnapshot({
            ...allValues,
            fieldSourceHints: nextSourceHints,
        });
        persistDraftLocally({
            ...allValues,
            fieldSourceHints: nextSourceHints,
        });
        setIsSaved(false);
    };

    const applyFloorAreasToObjectFields = () => {
        if (!floorAreaComparison.canRecalculate) {
            return;
        }

        applyFormPatch(
            {
                leasableArea: floorAreaComparison.leasableSum,
            },
            {
                sourceUpdates: { leasableArea: 'derived_from_floor_sum' },
            }
        );
        setAcceptedAreaMismatchKey(null);
        message.success('Арендопригодная площадь пересчитана по данным этажей');
    };

    const acceptAreaMismatch = () => {
        if (!floorAreaComparison.hasMismatch) {
            return;
        }

        setAcceptedAreaMismatchKey(floorAreaComparison.signature);
        message.info('Несоответствие площадей сохранено как осознанное');
    };

    const ensureAreaMismatchResolved = async () => {
        if (!showActualDataFields || !floorAreaComparison.hasMismatch) {
            return true;
        }

        if (acceptedAreaMismatchKey === floorAreaComparison.signature) {
            return true;
        }

        return new Promise((resolve) => {
            Modal.confirm({
                title: 'Арендопригодная площадь по этажам не совпадает с основным полем',
                centered: true,
                closable: false,
                maskClosable: false,
                keyboard: false,
                okText: 'Пересчитать по этажам',
                cancelText: 'Согласиться с несоответствием',
                content: (
                    <div>
                        <Paragraph>
                            Арендопригодная площадь сверху заполнена отдельно от этажей и сейчас
                            расходится с суммой по этажам. Перед сохранением нужно либо пересчитать
                            её по этажам, либо явно оставить как есть.
                        </Paragraph>
                        <div>
                            <Text strong>Арендопригодная площадь:</Text>{' '}
                            {floorAreaComparison.currentLeasable ?? 'не указано'} м² сверху против{' '}
                            {floorAreaComparison.leasableSum ?? 'не указано'} м² по этажам
                        </div>
                    </div>
                ),
                onOk: () => {
                    applyFloorAreasToObjectFields();
                    resolve(true);
                },
                onCancel: () => {
                    acceptAreaMismatch();
                    resolve(true);
                },
            });
        });
    };

    const buildEnrichmentPayload = () => {
        const values = form.getFieldsValue(true);

        return {
            ...values,
            floors: Array.isArray(floorsDataRef.current) && floorsDataRef.current.length > 0
                ? floorsDataRef.current
                : (Array.isArray(values.floors) ? values.floors : []),
            valuationDate: values.valuationDate && dayjs.isDayjs(values.valuationDate)
                ? values.valuationDate.format('YYYY-MM-DD')
                : values.valuationDate || null,
        };
    };

    const applyEnrichedQuestionnaire = (questionnaire) => {
        if (!questionnaire) return;

        const normalizedValues = {
            ...buildQuestionnaireFormValues(questionnaire),
            valuationDate: questionnaire?.valuationDate
                ? dayjs(questionnaire.valuationDate)
                : (form.getFieldValue('valuationDate') || null),
        };

        applyFormPatch(normalizedValues, {
            replaceSourceHints: normalizedValues.fieldSourceHints,
        });
        floorsDataRef.current = Array.isArray(normalizedValues.floors) ? normalizedValues.floors : [];
    };

    const runQuestionnaireEnrichment = async ({
        silent = false,
        forceRefresh = false,
    } = {}) => {
        if (!projectId) {
            return;
        }

        const buildingCad = String(form.getFieldValue('buildingCadastralNumber') || '').trim();

        if (!CADASTRAL_REGEX.test(buildingCad)) {
            if (!silent) {
                message.error('Введите кадастровый номер здания в формате 00:00:0000000:0');
            }
            return;
        }

        if (!forceRefresh && lastLoadedBuildingCadRef.current === buildingCad) {
            return;
        }
        setBuildingLoading(true);

        try {
            const { data } = await api.post(`/projects/${projectId}/questionnaire/enrich`, {
                ...buildEnrichmentPayload(),
                forceRefresh,
            });

            applyEnrichedQuestionnaire(data?.questionnaire);

            const nextBuildingCad = String(
                data?.questionnaire?.buildingCadastralNumber || buildingCad || ''
            ).trim();

            if (nextBuildingCad) {
                lastLoadedBuildingCadRef.current = nextBuildingCad;
            }

            const autoFilledFields = data?.enrichment?.autoFilledFields || [];
            const warnings = data?.enrichment?.warnings || [];

            if (!silent) {
                if (autoFilledFields.length > 0) {
                    message.success(`Автоматически дополнено полей: ${autoFilledFields.length}`);
                } else {
                    message.info('Все доступные автоданные уже заполнены');
                }
            }

            if (!silent && warnings.length > 0) {
                message.warning(warnings[0]);
            }
        } catch (error) {
            console.error('Ошибка автодополнения анкеты', error);

            if (!silent) {
                message.error(
                    error?.response?.data?.error || 'Не удалось автоматически дополнить анкету'
                );
            }
        } finally {
            setBuildingLoading(false);
        }
    };

    const inferBcClassByRate = () => {
        const rate = form.getFieldValue('averageRentalRate');

        if (!rate || Number(rate) <= 0) {
            message.warning('Сначала укажите среднюю рыночную ставку аренды');
            return;
        }

        let resolvedClass = 'C';
        if (rate >= 3500) resolvedClass = 'A+';
        else if (rate >= 2800) resolvedClass = 'A';
        else if (rate >= 2200) resolvedClass = 'B+';
        else if (rate >= 1600) resolvedClass = 'B';

        applyFormPatch(
            { marketClassResolved: resolvedClass },
            { sourceUpdates: { marketClassResolved: 'derived_from_rental_rate_manual_action' } }
        );
        message.success(`Для расчета выбран наиболее близкий класс: ${resolvedClass}`);
    };

    const fetchBuildingFromNSPD = async ({ silent = false, force = false } = {}) => {
        await runQuestionnaireEnrichment({
            silent,
            forceRefresh: force,
        });
    };

    const handleMapPick = () => {
        setMapPickerOpen(true);
    };

    const handleMapConfirm = ({ lat, lng, address, displayName }) => {
        const currentAddress = form.getFieldValue('objectAddress');
        const selectedAddress = address || displayName || currentAddress || '';

        applyFormPatch(
            {
                mapPointLat: lat,
                mapPointLng: lng,
                objectAddress: selectedAddress,
                addressConfirmed: Boolean(selectedAddress),
            },
            {
                sourceUpdates: {
                    mapPointLat: 'manual_map_selection',
                    mapPointLng: 'manual_map_selection',
                    objectAddress: 'manual_map_selection',
                },
            }
        );
        setMapPickerOpen(false);
        message.success('Координаты и адрес обновлены по карте');
    };

    const handleSave = async () => {
        form.setFieldsValue({ floors: floorsDataRef.current });
        const mismatchResolved = await ensureAreaMismatchResolved();
        if (!mismatchResolved) {
            return;
        }
        const ok = await saveQuestionnaire();
        if (ok) {
            setIsSaved(true);
        }
    };

    const handleSaveAndNext = async () => {
        form.setFieldsValue({ floors: floorsDataRef.current });
        const mismatchResolved = await ensureAreaMismatchResolved();
        if (!mismatchResolved) {
            return;
        }
        const ok = await saveQuestionnaire();
        if (ok) {
            setIsSaved(true);
            if (onGoNext) {
                onGoNext();
            }
        }
    };

    const handleBuildingCadBlur = async () => {
        await fetchBuildingFromNSPD({ silent: true });
    };

    const handleClearQuestionnaire = () => {
        clearQuestionnaire?.();
        floorsDataRef.current = [];
        setFieldSourceHintsState({});
        setAcceptedAreaMismatchKey(null);
        setIsSaved(false);
        setFormSnapshot({});
    };

    const handleFloorsChange = useCallback((floors) => {
        floorsDataRef.current = floors;
    }, []);

    return (
        <>
            <Card className="sharp-card project-step-shell">
                <div className="questionnaire-header">
                    <div>
                        <Title level={2} className="section-title mb-8">
                            Опросный лист
                        </Title>
                        {showQuestionnaireHints && (
                            <Paragraph className="questionnaire-subtext">
                                Заполните исходные данные по объекту. После этого можно перейти
                                к проверке, оплате и просмотру результата.
                            </Paragraph>
                        )}
                    </div>

                    <Space wrap>
                        <Tag color="blue" className="questionnaire-tag">
                            Заполнено: {questionnaireStatus.filled}/{questionnaireStatus.total}
                        </Tag>
                    </Space>
                </div>

                <Divider className="sharp-divider" />

                <Spin spinning={questionnaireLoading}>
                    <Form
                        form={form}
                        layout="vertical"
                        onValuesChange={handleValuesChange}
                    >
                        {showQuestionnaireHints && (
                            <QuestionnaireHintPanel
                                title={QUESTIONNAIRE_SECTION_HINTS.overview.title}
                                items={QUESTIONNAIRE_SECTION_HINTS.overview.items}
                                compact={compactQuestionnaire}
                            />
                        )}

                        <div className="form-block">
                            <Title level={4} className="form-block-title">
                                Основные сведения
                            </Title>

                            {showQuestionnaireHints && (
                                <QuestionnaireHintPanel
                                    title={QUESTIONNAIRE_SECTION_HINTS.basic.title}
                                    items={QUESTIONNAIRE_SECTION_HINTS.basic.items}
                                    compact={compactQuestionnaire}
                                />
                            )}

                            <Row gutter={[20, 0]}>
                                <Col xs={24} lg={12}>
                                    <Form.Item
                                        label="Способ расчета"
                                        name="calculationMethod"
                                        rules={[{ required: true, message: 'Выберите способ расчета' }]}
                                    >
                                        <Select
                                            placeholder="Выберите способ расчета"
                                            options={CALCULATION_OPTIONS}
                                        />
                                    </Form.Item>
                                </Col>

                                <Col xs={24} lg={12}>
                                    <Form.Item
                                        label="Название проекта"
                                        name="projectName"
                                        rules={[{ required: true, message: 'Введите название проекта' }]}
                                    >
                                        <Input
                                            className="sharp-input"
                                            placeholder="Например: Оценка БЦ на Невском"
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            {showQuestionnaireHints && showActualDataFields && (
                                <Alert
                                    className="questionnaire-alert"
                                    type="info"
                                    showIcon
                                    message="Для этого варианта расчета дополнительно потребуются арендопригодная площадь и занятая площадь."
                                    description="Оба поля заполняются как общие значения. По этажам сверяется только арендопригодная площадь, а занятая площадь задаётся только на уровне всего объекта."
                                />
                            )}
                        </div>

                        <div className="form-block">
                            <Title level={4} className="form-block-title">
                                Здание
                            </Title>

                            {showQuestionnaireHints && (
                                <QuestionnaireHintPanel
                                    title={QUESTIONNAIRE_SECTION_HINTS.building.title}
                                    items={QUESTIONNAIRE_SECTION_HINTS.building.items}
                                    compact={compactQuestionnaire}
                                />
                            )}

                            <Row gutter={[20, 0]}>
                                <Col xs={24}>
                                    <Form.Item
                                        label="Кадастровый номер здания"
                                        name="buildingCadastralNumber"
                                        normalize={(value) => String(value || '').trim()}
                                        rules={[
                                            { required: true, message: 'Введите кадастровый номер здания' },
                                            { pattern: CADASTRAL_REGEX, message: 'Формат: 00:00:0000000:0' },
                                        ]}
                                        extra={showQuestionnaireHints ? 'После ввода номера поле можно оставить: система сама попробует подтянуть максимум доступных данных.' : null}
                                    >
                                        <div className="questionnaire-cadastral-row">
                                            <Input
                                                className="sharp-input questionnaire-cadastral-input"
                                                placeholder="00:00:0000000:0"
                                                onBlur={handleBuildingCadBlur}
                                            />
                                            <Button
                                                icon={<DatabaseOutlined />}
                                                onClick={() => fetchBuildingFromNSPD({ force: true })}
                                                loading={buildingLoading}
                                                className="questionnaire-cadastral-fill-btn"
                                            >
                                                Заполнить данные по кадастровому номеру
                                            </Button>
                                        </div>
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={[20, 0]}>
                                <Col xs={24} lg={12}>
                                    <Form.Item
                                        label="Дата оценки"
                                        name="valuationDate"
                                        rules={[{ required: true, message: 'Укажите дату оценки' }]}
                                        extra={showQuestionnaireHints ? 'Дата нужна для подбора аналогов, квартала предложения и корректировок по времени.' : null}
                                    >
                                        <DatePicker
                                            className="full-width"
                                            format="DD.MM.YYYY"
                                            placeholder="дд.мм.гггг"
                                        />
                                    </Form.Item>
                                </Col>

                                {shouldShowDynamicField('objectType') && (
                                    <Col xs={24} lg={12}>
                                        <Form.Item
                                            label="Вид объекта"
                                            name="objectType"
                                            rules={[{ required: true, message: 'Укажите вид объекта' }]}
                                            extra={showQuestionnaireHints ? 'Тип объекта помогает выбрать корректный сценарий расчета и набор обязательных параметров.' : null}
                                        >
                                            <Select
                                                placeholder="Выберите тип объекта"
                                                options={OBJECT_TYPE_OPTIONS}
                                            />
                                        </Form.Item>
                                    </Col>
                                )}
                            </Row>

                            <Row gutter={[20, 0]}>
                                {showBuildingSubtypeField && (
                                    <Col xs={24} lg={12}>
                                        <Form.Item
                                            label="Тип здания"
                                            name="actualUse"
                                            rules={[{ required: true, message: 'Выберите тип здания' }]}
                                            extra={showQuestionnaireHints ? 'Это поле появляется только для объекта вида "здание".' : null}
                                        >
                                            <Select
                                                placeholder="Выберите вариант"
                                                options={BUILDING_TYPE_OPTIONS}
                                            />
                                        </Form.Item>
                                    </Col>
                                )}

                                {shouldShowDynamicField('businessCenterClass') && (
                                    <Col xs={24} lg={12}>
                                        <Form.Item
                                            label="Класс БЦ"
                                            name="businessCenterClass"
                                            rules={[{ required: true, message: 'Выберите класс БЦ' }]}
                                            extra={showQuestionnaireHints ? 'Для подбора аналогов сейчас используется строгое совпадение класса.' : null}
                                        >
                                            <Select
                                                placeholder="Выберите класс"
                                                options={BC_CLASS_OPTIONS}
                                            />
                                        </Form.Item>
                                    </Col>
                                )}
                            </Row>

                            {showRentalRateField && shouldShowDynamicField('averageRentalRate') && (
                                <Row gutter={[20, 0]}>
                                    <Col xs={24} lg={12}>
                                        <Form.Item
                                            label="Средняя рыночная ставка аренды"
                                            name="averageRentalRate"
                                            rules={[{ required: true, message: 'Укажите ставку аренды' }]}
                                        >
                                            <InputNumber
                                                className="full-width"
                                                min={0}
                                                placeholder="Введите ставку"
                                            />
                                        </Form.Item>
                                    </Col>

                                    <Col xs={24} lg={12} className="form-action-col">
                                        <Space wrap>
                                            <Button onClick={inferBcClassByRate}>
                                                Определить класс по ставке
                                            </Button>

                                            {marketClassResolved && (
                                                <Tag color="green">
                                                    Ближайший класс: {marketClassResolved}
                                                </Tag>
                                            )}
                                        </Space>
                                    </Col>
                                </Row>
                            )}
                        </div>

                        {/* {hiddenPlatformFieldCount > 0 && (
                            <div className="form-block">
                                <Title level={4} className="form-block-title">
                                    Данные платформы
                                </Title>

                                <Alert
                                    className="questionnaire-alert"
                                    type="info"
                                    showIcon
                                    message={`Автоматически определено скрытых полей: ${hiddenPlatformFieldCount}`}
                                    description="Подтянутые значения сохраняются в проекте и участвуют в расчёте, но не показываются до этапа результата. На этом шаге видны только поля, которые нужно заполнить вручную."
                                />
                            </div>
                        )} */}

                        {showLocationSection && (
                        <div className="form-block">
                            <Title level={4} className="form-block-title">
                                Местоположение
                            </Title>

                            {showQuestionnaireHints && (
                                <QuestionnaireHintPanel
                                    title={QUESTIONNAIRE_SECTION_HINTS.location.title}
                                    items={QUESTIONNAIRE_SECTION_HINTS.location.items}
                                    compact={compactQuestionnaire}
                                />
                            )}

                            <Row gutter={[20, 0]}>
                                {shouldShowDynamicField('mapPointLat') && (
                                    <Col xs={24} lg={8}>
                                        <Form.Item
                                            label="Широта"
                                            name="mapPointLat"
                                            extra={showQuestionnaireHints ? 'Если координаты уже подтянулись автоматически, менять их стоит только после проверки точки на карте.' : null}
                                        >
                                            <InputNumber className="full-width" placeholder="lat" />
                                        </Form.Item>
                                    </Col>
                                )}

                                {shouldShowDynamicField('mapPointLng') && (
                                    <Col xs={24} lg={8}>
                                        <Form.Item
                                            label="Долгота"
                                            name="mapPointLng"
                                            extra={showQuestionnaireHints ? 'Координаты используются для района, метро, исторического центра и пространственных признаков.' : null}
                                        >
                                            <InputNumber className="full-width" placeholder="lng" />
                                        </Form.Item>
                                    </Col>
                                )}

                                {(shouldShowDynamicField('mapPointLat') || shouldShowDynamicField('mapPointLng') || shouldShowDynamicField('objectAddress')) && (
                                    <Col xs={24} lg={8}>
                                        <Form.Item
                                            label=" "
                                            className="questionnaire-map-picker-item"
                                        >
                                            <Button
                                                block
                                                icon={<EnvironmentOutlined />}
                                                onClick={handleMapPick}
                                            >
                                                Указать на карте
                                            </Button>
                                        </Form.Item>
                                    </Col>
                                )}
                            </Row>

                            {shouldShowDynamicField('objectAddress') && (
                                <Row gutter={[20, 0]}>
                                    <Col xs={24}>
                                        <Form.Item
                                            label="Адрес объекта"
                                            name="objectAddress"
                                            rules={[{ required: true, message: 'Укажите адрес объекта' }]}
                                            extra={showQuestionnaireHints ? 'Сохраняйте самый детальный адрес: дом, корпус и литера помогают точнее связывать объект с источниками данных.' : null}
                                        >
                                            <TextArea
                                                rows={3}
                                                className="sharp-input"
                                                placeholder="Адрес объекта"
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            )}
                        </div>
                        )}

                        <div className="form-block">
                            <Title level={4} className="form-block-title">
                                Параметры здания
                            </Title>

                            {showQuestionnaireHints && (
                                <QuestionnaireHintPanel
                                    title={QUESTIONNAIRE_SECTION_HINTS.buildingParams.title}
                                    items={QUESTIONNAIRE_SECTION_HINTS.buildingParams.items}
                                    compact={compactQuestionnaire}
                                />
                            )}

                            <Row gutter={[20, 0]}>
                                {shouldShowDynamicField('totalArea') && (
                                    <Col xs={24} md={12} lg={8}>
                                        <Form.Item
                                            label="Общая площадь, кв.м"
                                            name="totalArea"
                                            rules={[{ required: true, message: 'Укажите общую площадь' }]}
                                            extra={showQuestionnaireHints ? 'Лучше сверять с кадастровыми данными: это одна из ключевых переменных в расчете удельной стоимости.' : null}
                                        >
                                            <InputNumber
                                                {...sqmInputProps}
                                                placeholder="Введите площадь"
                                            />
                                        </Form.Item>
                                    </Col>
                                )}

                                {shouldShowDynamicField('constructionYear') && (
                                    <Col xs={24} md={12} lg={8}>
                                        <Form.Item
                                            label="Год постройки / ввода / реконструкции"
                                            name="constructionYear"
                                            rules={[{ required: true, message: 'Укажите год' }]}
                                            extra={showQuestionnaireHints ? 'Если объект реконструировался, используйте год, который лучше отражает текущее состояние и рыночное позиционирование.' : null}
                                        >
                                            <InputNumber
                                                className="full-width"
                                                min={1800}
                                                max={2100}
                                                placeholder="Например, 2012"
                                            />
                                        </Form.Item>
                                    </Col>
                                )}

                                {shouldShowDynamicField('aboveGroundFloors') && (
                                    <Col xs={24} md={12} lg={8}>
                                        <Form.Item
                                            label="Количество надземных этажей"
                                            name="aboveGroundFloors"
                                            rules={[{ required: true, message: 'Укажите количество этажей' }]}
                                            extra={showQuestionnaireHints ? 'От этих данных зависит автогенерация этажных групп ниже.' : null}
                                        >
                                            <InputNumber
                                                className="full-width"
                                                min={0}
                                                placeholder="Введите значение"
                                            />
                                        </Form.Item>
                                    </Col>
                                )}
                            </Row>

                            <Row gutter={[20, 0]}>
                                <Col xs={24} md={12} lg={8}>
                                    <Form.Item
                                        label="Наличие цокольного этажа"
                                        name="hasBasementFloor"
                                        rules={[{ required: true, message: 'Выберите вариант' }]}
                                    >
                                        <Radio.Group
                                            options={YES_NO_OPTIONS}
                                            optionType="button"
                                            buttonStyle="solid"
                                        />
                                    </Form.Item>
                                </Col>

                                <Col xs={24} md={12} lg={8}>
                                    <Form.Item
                                        label="Количество подземных этажей"
                                        name="undergroundFloors"
                                        rules={[{ required: true, message: 'Укажите количество подземных этажей' }]}
                                    >
                                        <InputNumber
                                            className="full-width"
                                            min={0}
                                            placeholder="Введите значение"
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            {showActualDataFields && (
                                <Row gutter={[20, 0]}>
                                    {shouldShowDynamicField('leasableArea') && (
                                        <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Арендопригодная площадь, кв.м"
                                            name="leasableArea"
                                            rules={[{ required: true, message: 'Укажите арендопригодную площадь' }]}
                                            extra={areaSourceHints.leasableArea
                                                ? `Текущий источник: ${formatAreaSourceLabel(areaSourceHints.leasableArea)}`
                                                : null}
                                        >
                                            <InputNumber
                                                {...sqmInputProps}
                                                placeholder="Введите значение"
                                            />
                                        </Form.Item>
                                        </Col>
                                    )}

                                    {shouldShowDynamicField('occupiedArea') && (
                                        <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Занятая площадь по договорам аренды, м²"
                                            name="occupiedArea"
                                            rules={[{ required: true, message: 'Укажите занятую площадь' }]}
                                            extra={areaSourceHints.occupiedArea
                                                ? `Текущий источник: ${formatAreaSourceLabel(areaSourceHints.occupiedArea)}`
                                                : null}
                                        >
                                            <InputNumber
                                                {...sqmInputProps}
                                                placeholder="Введите площадь"
                                            />
                                        </Form.Item>
                                        </Col>
                                    )}
                                </Row>
                            )}
                        </div>

                        <div className="form-block">
                            <Title level={4} className="form-block-title">
                                Данные по этажам
                            </Title>

                            {showQuestionnaireHints && (
                                <QuestionnaireHintPanel
                                    title={QUESTIONNAIRE_SECTION_HINTS.floors.title}
                                    items={QUESTIONNAIRE_SECTION_HINTS.floors.items}
                                    compact={compactQuestionnaire}
                                />
                            )}

                            {showActualDataFields && floorAreaComparison.hasMismatch && (
                                <Alert
                                    className="questionnaire-alert"
                                    type={acceptedAreaMismatchKey === floorAreaComparison.signature ? 'warning' : 'error'}
                                    showIcon
                                    message="Арендопригодная площадь по этажам не совпадает с основным полем"
                                    description={(
                                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                            <div>
                                                {shouldShowDynamicField('leasableArea')
                                                    ? `Арендопригодная площадь: сверху ${floorAreaComparison.currentLeasable ?? 'не указано'} м², по этажам ${floorAreaComparison.leasableSum ?? 'не указано'} м².`
                                                    : 'Сумма по этажам не совпадает с сохранённым общим значением арендопригодной площади. До результата само значение платформы остаётся скрытым.'}
                                            </div>
                                            <Space wrap>
                                                <Button onClick={applyFloorAreasToObjectFields}>
                                                    Пересчитать по этажам
                                                </Button>
                                                <Button
                                                    type={acceptedAreaMismatchKey === floorAreaComparison.signature ? 'default' : 'primary'}
                                                    ghost={acceptedAreaMismatchKey !== floorAreaComparison.signature}
                                                    onClick={acceptAreaMismatch}
                                                >
                                                    Согласиться с несоответствием
                                                </Button>
                                            </Space>
                                        </Space>
                                    )}
                                />
                            )}

                            {showActualDataFields && !floorAreaComparison.hasMismatch && floorAreaComparison.needsInitialFill && (
                                <Alert
                                    className="questionnaire-alert"
                                    type="info"
                                    showIcon
                                    message="По этажам уже можно заполнить арендопригодную площадь"
                                    description={(
                                        <Space wrap>
                                            <span>
                                                Сумма арендопригодной площади по этажам рассчитана, но верхнее поле ещё не заполнено.
                                            </span>
                                            <Button onClick={applyFloorAreasToObjectFields}>
                                                Заполнить из этажей
                                            </Button>
                                        </Space>
                                    )}
                                />
                            )}

                            <Form.Item name="floors" noStyle />

                            <FloorDataSection
                                form={form}
                                showHints={showQuestionnaireHints}
                                onFloorsChange={handleFloorsChange}
                            />
                        </div>

                        <Divider className="sharp-divider" />
                    </Form>
                </Spin>

                <div className="project-step-actions">
                    <div className="project-step-actions-left">
                        <Button icon={<EyeOutlined />} onClick={() => setVerificationOpen(true)}>
                            Проверить данные
                        </Button>
                        <Button icon={<ReloadOutlined />} onClick={handleClearQuestionnaire}>
                            Очистить
                        </Button>
                    </div>

                    <div className="project-step-actions-right">
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            loading={questionnaireSaving}
                            onClick={handleSave}
                        >
                            Сохранить и продолжить
                        </Button>
                    </div>
                </div>
            </Card>

            <MapPickerModal
                open={mapPickerOpen}
                initialValue={currentPoint}
                onCancel={() => setMapPickerOpen(false)}
                onConfirm={handleMapConfirm}
            />

            {verificationOpen && (
                <VerificationSection
                    formValues={formSnapshot}
                    floors={form.getFieldValue('floors') || []}
                    onClose={() => setVerificationOpen(false)}
                />
            )}
        </>
    );
};
