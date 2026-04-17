import React, { useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Drawer,
    Form,
    Input,
    InputNumber,
    message,
    Space,
    Table,
} from 'antd';
import {
    fetchAdminCadastralRecords,
    refreshAdminCadastralRecord,
    updateAdminCadastralRecord,
    bulkUpdateAdminCadastralRecords,
    importAdminCadastralRecords,
    exportAdminCadastralRecords,
} from './Api';
import EditableGridModal from './EditableGridModal';
import { UploadOutlined, DownloadOutlined, TableOutlined } from '@ant-design/icons';
import { Upload } from 'antd';

export default function AdminCadastralTable() {
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [pageState, setPageState] = useState({ current: 1, pageSize: 20 });
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [form] = Form.useForm();
    const [gridOpen, setGridOpen] = useState(false);
    const [bulkSaving, setBulkSaving] = useState(false);
    const [sheetName, setSheetName] = useState('cadastral_records');

    const loadData = async (page = 1, pageSize = 20, currentSearch = search) => {
        try {
            setLoading(true);
            setError('');
            const data = await fetchAdminCadastralRecords({
                page,
                pageSize,
                search: currentSearch || undefined,
            });
            setRows(data.items || []);
            setTotal(data.total || 0);
            setPageState({ current: data.page || page, pageSize: data.pageSize || pageSize });
        } catch (e) {
            console.error(e);
            setError(e?.response?.data?.error || 'Не удалось загрузить кадастровые записи');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const openDrawer = (record) => {
        setSelectedRecord(record);
        form.setFieldsValue({
            address: record.address || '',
            district: record.district || '',
            latitude: record.latitude,
            longitude: record.longitude,
            total_area: record.total_area,
            land_area: record.land_area,
            cad_cost: record.cad_cost,
            permitted_use: record.permitted_use || '',
            object_type: record.object_type || '',
            year_built: record.year_built || '',
            year_commisioning: record.year_commisioning || '',
        });
        setDrawerOpen(true);
    };

    const handleSave = async () => {
        if (!selectedRecord) return;

        try {
            const values = await form.validateFields();
            await updateAdminCadastralRecord(selectedRecord.id, values);
            message.success('Кадастровая запись обновлена');
            setDrawerOpen(false);
            loadData(pageState.current, pageState.pageSize, search);
        } catch (e) {
            console.error(e);
            message.error(e?.response?.data?.error || 'Не удалось сохранить запись');
        }
    };

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 80 },
        { title: 'Кадастровый номер', dataIndex: 'cadastral_number' },
        { title: 'Адрес', dataIndex: 'address', ellipsis: true },
        { title: 'Широта', dataIndex: 'latitude', width: 120 },
        { title: 'Долгота', dataIndex: 'longitude', width: 120 },
        {
            title: 'Действия',
            render: (_, record) => (
                <Space wrap>
                    <Button onClick={() => openDrawer(record)}>Открыть</Button>
                    <Button onClick={async () => {
                        await refreshAdminCadastralRecord(record.id);
                        message.success('Запись обновлена из НСПД');
                        loadData(pageState.current, pageState.pageSize, search);
                    }}>
                        Обновить из НСПД
                    </Button>
                </Space>
            ),
        },
    ];

    const editableColumns = [
        { title: 'ID', dataIndex: 'id', type: 'string', width: 90, fixed: 'left' },
        { title: 'Кадастровый номер', dataIndex: 'cadastral_number', type: 'string', width: 220, fixed: 'left' },
        { title: 'Адрес', dataIndex: 'address', type: 'string', width: 320 },
        { title: 'Район', dataIndex: 'district', type: 'string', width: 180 },
        { title: 'Широта', dataIndex: 'latitude', type: 'number', width: 140 },
        { title: 'Долгота', dataIndex: 'longitude', type: 'number', width: 140 },
        { title: 'Площадь здания', dataIndex: 'total_area', type: 'number', width: 140 },
        { title: 'Площадь участка', dataIndex: 'land_area', type: 'number', width: 140 },
        { title: 'Кадастровая стоимость', dataIndex: 'cad_cost', type: 'number', width: 180 },
        { title: 'Разрешенное использование', dataIndex: 'permitted_use', type: 'string', width: 240 },
        { title: 'Тип объекта', dataIndex: 'object_type', type: 'string', width: 160 },
        { title: 'Год постройки', dataIndex: 'year_built', type: 'string', width: 140 },
        { title: 'Год ввода', dataIndex: 'year_commisioning', type: 'string', width: 140 },
    ];

    return (
        <div>
            {/*<Space style={{ marginBottom: 16 }}>*/}
            {/*    <Input.Search*/}
            {/*        allowClear*/}
            {/*        placeholder="Поиск по кадастровому номеру или адресу"*/}
            {/*        onSearch={(value) => {*/}
            {/*            setSearch(value);*/}
            {/*            loadData(1, pageState.pageSize, value);*/}
            {/*        }}*/}
            {/*        style={{ width: 360 }}*/}
            {/*    />*/}
            {/*</Space>*/}

            <Space wrap style={{ marginBottom: 16 }}>
                <Input.Search
                    allowClear
                    placeholder="Поиск по кадастровому номеру или адресу"
                    onSearch={(value) => {
                        setSearch(value);
                        loadData(1, pageState.pageSize, value);
                    }}
                    style={{ width: 360 }}
                />

                <Input
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder="Имя листа для импорта"
                    style={{ width: 220 }}
                />

                <Upload
                    accept=".xlsx,.xls"
                    showUploadList={false}
                    customRequest={async ({ file, onSuccess, onError }) => {
                        try {
                            const result = await importAdminCadastralRecords(file, sheetName);
                            message.success(`Импорт завершён: добавлено ${result.inserted}, обновлено ${result.updated}`);
                            onSuccess?.(result);
                            loadData(pageState.current, pageState.pageSize, search);
                        } catch (e) {
                            message.error(e?.response?.data?.error || 'Ошибка импорта');
                            onError?.(e);
                        }
                    }}
                >
                    <Button icon={<UploadOutlined />}>Импорт Excel</Button>
                </Upload>

                <Button
                    icon={<DownloadOutlined />}
                    onClick={async () => {
                        try {
                            const blob = await exportAdminCadastralRecords();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'cadastral_records_export.xlsx';
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            window.URL.revokeObjectURL(url);
                        } catch (e) {
                            message.error('Не удалось экспортировать кадастровые данные');
                        }
                    }}
                >
                    Экспорт Excel
                </Button>

                <Button
                    icon={<TableOutlined />}
                    onClick={() => setGridOpen(true)}
                >
                    Табличное редактирование
                </Button>
            </Space>

            {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}

            <Table
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={rows}
                pagination={{
                    current: pageState.current,
                    pageSize: pageState.pageSize,
                    total,
                    onChange: (page, pageSize) => loadData(page, pageSize, search),
                }}
            />

            <Drawer
                title={selectedRecord ? `Кадастровая запись #${selectedRecord.id}` : 'Кадастровая запись'}
                open={drawerOpen}
                width={560}
                onClose={() => setDrawerOpen(false)}
                extra={<Button type="primary" onClick={handleSave}>Сохранить</Button>}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="address" label="Адрес">
                        <Input.TextArea rows={3} />
                    </Form.Item>

                    <Form.Item name="district" label="Район">
                        <Input />
                    </Form.Item>

                    <Form.Item name="latitude" label="Широта">
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item name="longitude" label="Долгота">
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item name="total_area" label="Площадь здания">
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item name="land_area" label="Площадь участка">
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item name="cad_cost" label="Кадастровая стоимость">
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item name="permitted_use" label="Разрешённое использование">
                        <Input.TextArea rows={2} />
                    </Form.Item>

                    <Form.Item name="object_type" label="Тип объекта">
                        <Input />
                    </Form.Item>

                    <Form.Item name="year_built" label="Год постройки">
                        <Input />
                    </Form.Item>

                    <Form.Item name="year_commisioning" label="Год ввода">
                        <Input />
                    </Form.Item>
                </Form>
            </Drawer>
            <EditableGridModal
                open={gridOpen}
                title="Кадастровые данные — табличное редактирование"
                columnsConfig={editableColumns}
                rows={rows}
                loading={bulkSaving}
                onClose={() => setGridOpen(false)}
                onSave={async (nextRows) => {
                    try {
                        setBulkSaving(true);
                        await bulkUpdateAdminCadastralRecords(nextRows);
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