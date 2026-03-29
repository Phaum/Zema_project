import React, { useEffect, useState } from 'react';
import { Alert, Button, Input, message, Space, Table, Upload, Modal } from 'antd';
import { UploadOutlined, DownloadOutlined, TableOutlined, DeleteOutlined } from '@ant-design/icons';
import {
    fetchAdminAnalogues,
    importAdminAnalogues,
    exportAdminAnalogues,
    bulkUpdateAdminAnalogues,
    clearAdminAnalogues,
} from './Api';
import EditableGridModal from './EditableGridModal';

export default function AdminAnaloguesTable() {
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [pageState, setPageState] = useState({ current: 1, pageSize: 20 });
    const [search, setSearch] = useState('');
    const [sheetName, setSheetName] = useState('analogues');
    const [error, setError] = useState('');
    const [gridOpen, setGridOpen] = useState(false);
    const [bulkSaving, setBulkSaving] = useState(false);

    const loadData = async (page = 1, pageSize = 20, currentSearch = search) => {
        try {
            setLoading(true);
            setError('');

            const data = await fetchAdminAnalogues({
                page,
                pageSize,
                search: currentSearch || undefined,
            });

            setRows(data.items || []);
            setTotal(data.total || 0);
            setPageState({ current: data.page || page, pageSize: data.pageSize || pageSize });
        } catch (e) {
            console.error(e);
            setError(e?.response?.data?.error || 'Не удалось загрузить базу аналогов');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleExport = async () => {
        try {
            const blob = await exportAdminAnalogues();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'analogues_export.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            message.error('Не удалось экспортировать файл');
        }
    };

    const handleClearDatabase = async () => {
        Modal.confirm({
            title: 'Очистить базу аналогов?',
            content: 'Это удалит все записи из базы аналогов. Действие необратимо.',
            okText: 'Удалить',
            okType: 'danger',
            cancelText: 'Отмена',
            onOk: async () => {
                try {
                    setLoading(true);
                    await clearAdminAnalogues();
                    message.success('База аналогов успешно очищена');
                    await loadData(1, pageState.pageSize, '');
                    setSearch('');
                } catch (error) {
                    console.error(error);
                    message.error(
                        error?.response?.data?.error || 'Не удалось очистить базу аналогов'
                    );
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 140, fixed: 'left' },
        { title: 'Функционал', dataIndex: 'model_func', width: 180 },
        { title: 'Площадь', dataIndex: 'total_area', width: 120 },
        { title: 'Адрес', dataIndex: 'address', ellipsis: true },
        { title: 'КН', dataIndex: 'cadastral', width: 180 },
        { title: 'Район', dataIndex: 'district', width: 140 },
        { title: 'Цена/м²', dataIndex: 'price_per_meter_cut_nds', width: 140 },
        { title: 'Unit price', dataIndex: 'unit_price', width: 140 },
        { title: 'Дата предложения', dataIndex: 'date_offer', width: 160 },
    ];

    const editableColumns = [
        { title: 'ID', dataIndex: 'id', type: 'string', width: 140, fixed: 'left' },
        { title: 'Тип родительского объекта', dataIndex: 'parent_object_type', type: 'string', width: 220 },
        { title: 'Функционал модели', dataIndex: 'model_func', type: 'string', width: 180 },
        { title: 'Подгруппа', dataIndex: 'subgroup', type: 'string', width: 160 },
        { title: 'Функция', dataIndex: 'func', type: 'string', width: 180 },
        { title: 'Площадь', dataIndex: 'total_area', type: 'number', width: 130 },
        { title: 'Класс', dataIndex: 'class_offer', type: 'string', width: 120 },
        { title: 'Метро', dataIndex: 'station_name', type: 'string', width: 160 },
        { title: 'Адрес', dataIndex: 'address', type: 'string', width: 320 },
        { title: 'Здание', dataIndex: 'building', type: 'string', width: 220 },
        { title: 'Этаж', dataIndex: 'floor', type: 'string', width: 120 },
        { title: 'Наземные этажи', dataIndex: 'ground_floors', type: 'number', width: 140 },
        { title: 'Этажей всего', dataIndex: 'total_floors', type: 'number', width: 140 },
        { title: 'Подземные этажи', dataIndex: 'underground_floors', type: 'number', width: 140 },
        { title: 'Цена', dataIndex: 'price', type: 'number', width: 150 },
        { title: 'Цена за м²', dataIndex: 'price_per_meter', type: 'number', width: 150 },
        { title: 'Цена/м² без НДС', dataIndex: 'price_per_meter_cut_nds', type: 'number', width: 180 },
        { title: 'Unit price', dataIndex: 'unit_price', type: 'number', width: 150 },
        { title: 'НДС', dataIndex: 'nds', type: 'string', width: 120 },
        { title: 'НДС описание', dataIndex: 'nds_description', type: 'string', width: 220 },
        { title: 'Описание', dataIndex: 'description', type: 'string', width: 320 },
        { title: 'КУ', dataIndex: 'ku', type: 'string', width: 120 },
        { title: 'КУ описание', dataIndex: 'ku_description', type: 'string', width: 220 },
        { title: 'Экспл. расходы', dataIndex: 'expl_spends', type: 'string', width: 220 },
        { title: 'КН', dataIndex: 'cadastral', type: 'string', width: 180 },
        { title: 'x', dataIndex: 'x', type: 'number', width: 120 },
        { title: 'y', dataIndex: 'y', type: 'number', width: 120 },
        { title: 'lat', dataIndex: 'lat', type: 'number', width: 120 },
        { title: 'lon', dataIndex: 'lon', type: 'number', width: 120 },
        { title: 'Район', dataIndex: 'district', type: 'string', width: 160 },
        { title: 'Дата предложения', dataIndex: 'date_offer', type: 'string', width: 160 },
        { title: 'Квартал', dataIndex: 'quarter', type: 'string', width: 120 },
        { title: 'Состояние', dataIndex: 'condition_building', type: 'string', width: 180 },
        { title: 'Ссылка', dataIndex: 'link', type: 'string', width: 240 },
        { title: 'Скриншот', dataIndex: 'screenshot', type: 'string', width: 220 },
        { title: 'Ист. центр', dataIndex: 'is_historical_center', type: 'string', width: 140 },
        { title: 'Год постройки', dataIndex: 'built_year', type: 'string', width: 140 },
        { title: 'Год эксплуатации', dataIndex: 'expl_year', type: 'string', width: 140 },
        { title: 'Срок жизни', dataIndex: 'new_life_year', type: 'string', width: 140 },
        { title: 'Окружение 1', dataIndex: 'env_category_1', type: 'string', width: 180 },
        { title: 'Окружение 2', dataIndex: 'env_category_2', type: 'string', width: 180 },
    ];

    return (
        <div>
            <Space wrap style={{ marginBottom: 16 }}>
                <Input.Search
                    allowClear
                    placeholder="Поиск по ID, адресу, КН, району"
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
                            const result = await importAdminAnalogues(file, sheetName);
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
                title="База аналогов — табличное редактирование"
                columnsConfig={editableColumns}
                rows={rows}
                loading={bulkSaving}
                onClose={() => setGridOpen(false)}
                onSave={async (nextRows) => {
                    try {
                        setBulkSaving(true);
                        await bulkUpdateAdminAnalogues(nextRows);
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