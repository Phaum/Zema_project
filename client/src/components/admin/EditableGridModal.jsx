import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Space, Table } from 'antd';

function renderCellEditor(type, value, onChange) {
    if (type === 'number') {
        return (
            <InputNumber
                value={value}
                onChange={onChange}
                style={{ width: '100%' }}
            />
        );
    }

    return (
        <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

export default function EditableGridModal({
    open,
    title,
    columnsConfig,
    rows,
    loading,
    onClose,
    onSave,
}) {
    const [localRows, setLocalRows] = useState([]);

    useEffect(() => {
        setLocalRows(Array.isArray(rows) ? rows.map((item) => ({ ...item })) : []);
    }, [rows]);

    const updateCell = (rowKey, dataIndex, nextValue) => {
        setLocalRows((prev) =>
            prev.map((item) =>
                item.id === rowKey ? { ...item, [dataIndex]: nextValue } : item
            )
        );
    };

    const tableColumns = useMemo(() => {
        return columnsConfig.map((col) => ({
            title: col.title,
            dataIndex: col.dataIndex,
            width: col.width,
            fixed: col.fixed,
            render: (_, record) => renderCellEditor(
                col.type || 'string',
                record[col.dataIndex],
                (nextValue) => updateCell(record.id, col.dataIndex, nextValue)
            ),
        }));
    }, [columnsConfig]);

    return (
        <Modal
            title={title}
            open={open}
            onCancel={onClose}
            width={1400}
            footer={
                <Space>
                    <Button onClick={onClose}>Отмена</Button>
                    <Button
                        type="primary"
                        loading={loading}
                        onClick={() => onSave(localRows)}
                    >
                        Сохранить изменения
                    </Button>
                </Space>
            }
        >
            <Table
                rowKey="id"
                size="small"
                dataSource={localRows}
                columns={tableColumns}
                pagination={false}
                scroll={{ x: 1800, y: 520 }}
                bordered
            />
        </Modal>
    );
}