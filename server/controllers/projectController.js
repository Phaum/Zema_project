import {
    ValuationProject,
    ProjectQuestionnaire,
    ProjectResult,
    User,
} from '../models/index.js';
import { PAYMENT_STATUS, hasActiveSubscription } from '../constants/payment.js';

function attachProjectAccess(project, subscriptionActive) {
    const plain = typeof project?.toJSON === 'function' ? project.toJSON() : { ...(project || {}) };
    const projectPaid = plain.payment_status === PAYMENT_STATUS.PAID;

    return {
        ...plain,
        access: {
            subscriptionActive,
            projectPaid,
            calculationAllowed: subscriptionActive || projectPaid,
            accessSource: subscriptionActive ? 'subscription' : projectPaid ? 'one_time' : null,
            paymentStepRequired: !subscriptionActive,
        },
    };
}

export const getProjects = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'subscription_status', 'subscription_expires_at'],
        });
        const subscriptionActive = hasActiveSubscription(user);

        const projects = await ValuationProject.findAll({
            where: { user_id: req.user.id },
            attributes: [
                'id',
                'user_id',
                'name',
                'object_type',
                'status',
                'payment_status',
                'payment_tariff_code',
                'payment_amount',
                'payment_currency',
                'paid_at',
                'created_at',
                'updated_at',
            ],
            include: [
                {
                    model: ProjectQuestionnaire,
                    as: 'questionnaire',
                    required: false,
                    attributes: [
                        'id',
                        'project_id',
                        'projectName',
                        'calculationMethod',
                        'objectType',
                        'buildingCadastralNumber',
                        'objectAddress',
                        'totalArea',
                        'created_at',
                        'updated_at',
                    ],
                },
                {
                    model: ProjectResult,
                    as: 'result',
                    required: false,
                    attributes: [
                        'id',
                        'project_id',
                        'estimated_value',
                        'created_at',
                        'updated_at',
                    ],
                },
            ],
            order: [['updated_at', 'DESC']],
        });

        res.json(projects.map((project) => attachProjectAccess(project, subscriptionActive)));
    } catch (error) {
        console.error('Ошибка получения проектов:', error);
        res.status(500).json({
            error: 'Не удалось получить проекты',
            details: error.message,
        });
    }
};

export const createProject = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Название проекта обязательно' });
        }

        const project = await ValuationProject.create({
            user_id: req.user.id,
            name,
            object_type: null,
            status: 'questionnaire',
        });

        await ProjectQuestionnaire.create({
            project_id: project.id,
            projectName: name,
            calculationMethod: 'market',
            objectType: null,
        });

        const [fullProject, user] = await Promise.all([
            ValuationProject.findByPk(project.id, {
                include: [{ model: ProjectQuestionnaire, as: 'questionnaire', required: false }],
            }),
            User.findByPk(req.user.id, {
                attributes: ['id', 'subscription_status', 'subscription_expires_at'],
            }),
        ]);

        res.status(201).json(
            attachProjectAccess(fullProject, hasActiveSubscription(user))
        );
    } catch (error) {
        console.error('Ошибка создания проекта:', error);
        res.status(500).json({ error: 'Не удалось создать проект' });
    }
};

export const getProjectById = async (req, res) => {
    try {
        const [project, user] = await Promise.all([
            ValuationProject.findOne({
                where: {
                    id: req.params.projectId,
                    user_id: req.user.id,
                },
                include: [
                    { model: ProjectQuestionnaire, as: 'questionnaire', required: false },
                    { model: ProjectResult, as: 'result', required: false },
                ],
            }),
            User.findByPk(req.user.id, {
                attributes: ['id', 'subscription_status', 'subscription_expires_at'],
            }),
        ]);

        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        res.json(attachProjectAccess(project, hasActiveSubscription(user)));
    } catch (error) {
        console.error('Ошибка получения проекта:', error);
        res.status(500).json({ error: 'Не удалось получить проект' });
    }
};

export const updateProject = async (req, res) => {
    try {
        const project = await ValuationProject.findOne({
            where: {
                id: req.params.projectId,
                user_id: req.user.id,
            },
        });

        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        await project.update({
            name: req.body.name ?? project.name,
            object_type: req.body.object_type ?? project.object_type,
            status: req.body.status ?? project.status,
            payment_status: req.body.payment_status ?? project.payment_status,
        });

        res.json(project);
    } catch (error) {
        console.error('Ошибка обновления проекта:', error);
        res.status(500).json({ error: 'Не удалось обновить проект' });
    }
};

export const deleteProject = async (req, res) => {
    try {
        const project = await ValuationProject.findOne({
            where: {
                id: req.params.projectId,
                user_id: req.user.id,
            },
        });

        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        // Delete related data first
        await ProjectQuestionnaire.destroy({
            where: { project_id: project.id },
        });

        await ProjectResult.destroy({
            where: { project_id: project.id },
        });

        // Delete the project itself
        await project.destroy();

        res.json({
            success: true,
            message: 'Проект успешно удалён',
        });
    } catch (error) {
        console.error('Ошибка удаления проекта:', error);
        res.status(500).json({
            error: 'Не удалось удалить проект',
            details: error.message,
        });
    }
};
