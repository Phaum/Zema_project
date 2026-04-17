import React from 'react';
import { Form, Input, Modal } from 'antd';

export default function CreateProjectModal({
   open,
   form,
   confirmLoading,
   onCancel,
   onOk,
}) {
    return (
        <Modal
            title="Создать проект"
            open={open}
            onCancel={onCancel}
            onOk={onOk}
            confirmLoading={confirmLoading}
            okText="Создать"
            cancelText="Отмена"
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    name="name"
                    label="Название проекта"
                    rules={[{ required: true, message: 'Введите название проекта' }]}
                >
                    <Input placeholder="Например: БЦ на Невском" />
                </Form.Item>
            </Form>
        </Modal>
    );
}
