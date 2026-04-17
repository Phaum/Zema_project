import React, { useEffect, useState } from 'react';
import { Alert, Button, Input, message, Space, Table, Upload, Modal } from 'antd';
import { UploadOutlined, DownloadOutlined, TableOutlined, DeleteOutlined } from '@ant-design/icons';
import {
    fetchAdminMarketOffers,
    importAdminMarketOffers,
    exportAdminMarketOffers,
    bulkUpdateAdminMarketOffers,
    bulkCalculateAdminMarketOfferEnvironment,
    calculateAdminMarketOfferEnvironment,
    clearAdminMarketOffers,
} from './Api';
import EditableGridModal from './EditableGridModal';

export default function AdminMarketOffersTable() {
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [pageState, setPageState] = useState({ current: 1, pageSize: 20 });
    const [search, setSearch] = useState('');
    const [sheetName, setSheetName] = useState('офис актуальный файл');
    const [error, setError] = useState('');
    const [gridOpen, setGridOpen] = useState(false);
    const [bulkSaving, setBulkSaving] = useState(false);

    const [environmentLoadingId, setEnvironmentLoadingId] = useState(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [bulkEnvironmentLoading, setBulkEnvironmentLoading] = useState(false);

    const handleClearDatabase = async () => {
        Modal.confirm({
            title: 'Очистить рыночную базу?',
            content: 'Это удалит все записи из рыночной базы. Действие необратимо.',
            okText: 'Удалить',
            okType: 'danger',
            cancelText: 'Отмена',
            onOk: async () => {
                try {
                    setLoading(true);
                    await clearAdminMarketOffers();
                    message.success('Рыночная база успешно очищена');
                    await loadData(1, pageState.pageSize, '');
                    setSearch('');
                } catch (error) {
                    console.error(error);
                    message.error(
                        error?.response?.data?.error || 'Не удалось очистить рыночную базу'
                    );
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const loadData = async (page = 1, pageSize = 20, currentSearch = search) => {
        try {
            setLoading(true);
            setError('');
            const data = await fetchAdminMarketOffers({
                page,
                pageSize,
                search: currentSearch || undefined,
            });
            setRows(data.items || []);
            setTotal(data.total || 0);
            setPageState({ current: data.page || page, pageSize: data.pageSize || pageSize });
        } catch (e) {
            console.error(e);
            setError(e?.response?.data?.error || 'Не удалось загрузить рыночную базу');
        } finally {
            setLoading(false);
        }
    };

    const handleCalculateEnvironment = async (row) => {
        try {
            setEnvironmentLoadingId(row.id);
            await calculateAdminMarketOfferEnvironment(row.id);
            message.success(`Окружение для оффера #${row.id} пересчитано`);
            await loadData(pageState.current, pageState.pageSize, search);
        } catch (error) {
            console.error(error);
            message.error(
                error?.response?.data?.error || 'Не удалось пересчитать окружение'
            );
        } finally {
            setEnvironmentLoadingId(null);
        }
    };

    const handleBulkCalculateEnvironment = async () => {
        if (!selectedRowKeys.length) {
            message.warning('Сначала выберите офферы');
            return;
        }

        try {
            setBulkEnvironmentLoading(true);

            const result = await bulkCalculateAdminMarketOfferEnvironment(selectedRowKeys);

            if (result?.errorsCount) {
                console.error('Ошибки пересчёта окружения:', result.errors);
                message.warning(
                    `Пересчитано ${result.processed}, ошибок: ${result.errorsCount}`
                );
            } else {
                message.success(`Пересчитано ${result.processed}`);
            }

            await loadData(pageState.current, pageState.pageSize, search);
        } catch (error) {
            console.error(error);
            message.error(
                error?.response?.data?.error || 'Не удалось выполнить массовый пересчёт'
            );
        } finally {
            setBulkEnvironmentLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const columns = [
        { title: 'ID', dataIndex: 'external_id', width: 120 },
        { title: 'Функционал', dataIndex: 'model_functional', width: 180 },
        { title: 'Площадь', dataIndex: 'area_total', width: 120 },
        { title: 'Адрес', dataIndex: 'address_offer', ellipsis: true },
        { title: 'КН здания', dataIndex: 'building_cadastral_number', width: 180 },
        { title: 'Район', dataIndex: 'district', width: 140 },
        { title: 'Окружение 1', dataIndex: 'environment_category_1', width: 180 },
        { title: 'Окружение 2', dataIndex: 'environment_category_2', width: 180 },
        { title: 'Окружение 3', dataIndex: 'environment_category_3', width: 180 },
        { title: 'Дата предложения', dataIndex: 'offer_date', width: 140 },
        { title: 'Действия', key: 'actions', width: 180, fixed: 'right',
            render: (_, row) => (
                <Button
                    size="small"
                    loading={environmentLoadingId === row.id}
                    onClick={() => handleCalculateEnvironment(row)}
                >
                    Пересчитать
                </Button>
            ),
        }
    ];

    const handleExport = async () => {
        try {
            const blob = await exportAdminMarketOffers();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'market_offers_export.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            message.error('Не удалось экспортировать файл');
        }
    };

    const editableColumns = [
        { title: 'ID', dataIndex: 'id', type: 'string', width: 90, fixed: 'left' },
        { title: 'Внешний ID', dataIndex: 'external_id', type: 'string', width: 120, fixed: 'left' },
        { title: 'Тип родительского объекта', dataIndex: 'parent_object_type', type: 'string', width: 220 },
        { title: 'Функционал для модели', dataIndex: 'model_functional', type: 'string', width: 220 },
        { title: 'подгруппа 2025', dataIndex: 'subgroup_2025', type: 'string', width: 160 },
        { title: 'Функция', dataIndex: 'function_name', type: 'string', width: 180 },
        { title: 'Площадь', dataIndex: 'area_total', type: 'number', width: 130 },
        { title: 'Класс', dataIndex: 'class_offer', type: 'string', width: 120 },
        { title: 'Метро', dataIndex: 'metro', type: 'string', width: 160 },
        { title: 'Адрес', dataIndex: 'address_offer', type: 'string', width: 320 },
        { title: 'Здание', dataIndex: 'building_name', type: 'string', width: 220 },
        { title: 'Год постройки/ввода', dataIndex: 'year_built_commissioning', type: 'string', width: 180 },
        { title: 'Этаж', dataIndex: 'floor_location', type: 'string', width: 120 },
        { title: 'Наземные этажи', dataIndex: 'above_ground_floors', type: 'number', width: 140 },
        { title: 'Этажей всего', dataIndex: 'total_floors', type: 'number', width: 140 },
        { title: 'Подземные этажи', dataIndex: 'underground_floors', type: 'number', width: 140 },
        { title: 'Цена/месяц', dataIndex: 'price_total_month', type: 'number', width: 160 },
        { title: 'Цена кв.м./месяц', dataIndex: 'price_per_sqm_month', type: 'number', width: 160 },
        { title: 'НДС', dataIndex: 'vat', type: 'string', width: 120 },
        { title: 'НДС описание', dataIndex: 'vat_description', type: 'string', width: 220 },
        { title: 'Цена без НДС', dataIndex: 'price_without_vat_per_sqm_month', type: 'number', width: 160 },
        { title: 'Описание', dataIndex: 'description', type: 'string', width: 320 },
        { title: 'КУ', dataIndex: 'utilities_included', type: 'string', width: 120 },
        { title: 'КУ описание', dataIndex: 'utilities_description', type: 'string', width: 220 },
        { title: 'OPEX описание', dataIndex: 'opex_description', type: 'string', width: 220 },
        { title: 'Удельная цена очищенная', dataIndex: 'price_per_sqm_cleaned', type: 'number', width: 180 },
        { title: 'КН здания', dataIndex: 'building_cadastral_number', type: 'string', width: 180 },
        { title: 'x', dataIndex: 'x', type: 'number', width: 120 },
        { title: 'y', dataIndex: 'y', type: 'number', width: 120 },
        { title: 'Район', dataIndex: 'district', type: 'string', width: 160 },
        { title: 'Дата предложения', dataIndex: 'offer_date', type: 'string', width: 160 },
        { title: 'Квартал', dataIndex: 'quarter', type: 'string', width: 120 },
        { title: 'Состояние помещения', dataIndex: 'room_condition', type: 'string', width: 180 },
        { title: 'Ссылка', dataIndex: 'offer_url', type: 'string', width: 240 },
        { title: 'Принтскрин', dataIndex: 'screenshot', type: 'string', width: 220 },
        { title: 'Окружение 1', dataIndex: 'environment_category_1', type: 'string', width: 180 },
        { title: 'Окружение 2', dataIndex: 'environment_category_2', type: 'string', width: 180 },
        { title: 'Окружение 3', dataIndex: 'environment_category_3', type: 'string', width: 180 },
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: setSelectedRowKeys,
    };

    return (
        <div>
            <Space wrap style={{ marginBottom: 16 }}>
                <Input.Search
                    allowClear
                    placeholder="Поиск по ID, адресу, КН здания, району"
                    style={{ width: 340 }}
                    onSearch={(value) => {
                        setSearch(value);
                        loadData(1, pageState.pageSize, value);
                    }}
                />

                <Input
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder="Имя листа для импорта"
                    style={{ width: 240 }}
                />

                <Upload
                    accept=".xlsx,.xls"
                    showUploadList={false}
                    customRequest={async ({ file, onSuccess, onError }) => {
                        try {
                            const result = await importAdminMarketOffers(file, sheetName);
                            message.success(
                                `Импорт завершён: добавлено ${result.inserted}, обновлено ${result.updated}`
                            );
                            onSuccess?.(result);
                            loadData(1, pageState.pageSize, search);
                        } catch (e) {
                            console.error(e);
                            message.error(e?.response?.data?.error || 'Ошибка импорта');
                            onError?.(e);
                        }
                    }}
                >
                    <Button icon={<UploadOutlined />}>Импорт Excel</Button>
                </Upload>

                <Button icon={<DownloadOutlined />} onClick={handleExport}>
                    Экспорт Excel
                </Button>

                <Button
                    icon={<TableOutlined />}
                    disabled={!rows.length}
                    onClick={() => setGridOpen(true)}
                >
                    Табличное редактирование
                </Button>

                <Button
                    onClick={handleBulkCalculateEnvironment}
                    loading={bulkEnvironmentLoading}
                    disabled={!selectedRowKeys.length}
                >
                    Рассчитать окружение для выбранных
                </Button>

                <Button
                    icon={<DeleteOutlined />}
                    danger
                    onClick={handleClearDatabase}
                >
                    Очистить базу
                </Button>
            </Space>

            {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}

            <Table
                rowKey="id"
                rowSelection={rowSelection}
                loading={loading}
                columns={columns}
                dataSource={rows}
                scroll={{ x: 1400 }}
                pagination={{
                    current: pageState.current,
                    pageSize: pageState.pageSize,
                    total,
                    onChange: (page, pageSize) => loadData(page, pageSize, search),
                }}
            />

            <EditableGridModal
                open={gridOpen}
                title="Рыночная база — табличное редактирование"
                columnsConfig={editableColumns}
                rows={rows}
                loading={bulkSaving}
                onClose={() => setGridOpen(false)}
                onSave={async (nextRows) => {
                    try {
                        setBulkSaving(true);
                        await bulkUpdateAdminMarketOffers(nextRows);
                        message.success('Изменения сохранены');
                        setGridOpen(false);
                        loadData(pageState.current, pageState.pageSize, search);
                    } catch (e) {
                        message.error(e?.response?.data?.error || 'Не удалось сохранить изменения');
                    } finally {
                        setBulkSaving(false);
                    }
                }}
            />
        </div>
    );
}