import {
    ProjectQuestionnaire,
    ProjectResult,
    User,
    ValuationProject,
} from '../models/index.js';
import { sequelize } from '../config/db.js';
import { PAYMENT_STATUS, hasActiveSubscription } from '../constants/payment.js';
import { AppError } from '../utils/errorHandler.js';
import { asyncHandler, sendJson } from '../utils/http.js';

const PROJECT_ATTRIBUTES = [
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
];

const PROJECT_QUESTIONNAIRE_ATTRIBUTES = [
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
];

const PROJECT_RESULT_ATTRIBUTES = [
    'id',
    'project_id',
    'estimated_value',
    'created_at',
    'updated_at',
];

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

async function loadUserSubscriptionState(userId, transaction) {
    const user = await User.findByPk(userId, {
        attributes: ['id', 'subscription_status', 'subscription_expires_at'],
        transaction,
    });

    return hasActiveSubscription(user);
}

function buildProjectInclude({ includeDetails = false } = {}) {
    return [
        {
            model: ProjectQuestionnaire,
            as: 'questionnaire',
            required: false,
            attributes: includeDetails ? undefined : PROJECT_QUESTIONNAIRE_ATTRIBUTES,
        },
        {
            model: ProjectResult,
            as: 'result',
            required: false,
            attributes: includeDetails ? undefined : PROJECT_RESULT_ATTRIBUTES,
        },
    ];
}

async function findOwnedProject(projectId, userId, options = {}) {
    const { transaction, includeDetails = false } = options;

    return ValuationProject.findOne({
        where: {
            id: projectId,
            user_id: userId,
        },
        attributes: PROJECT_ATTRIBUTES,
        include: buildProjectInclude({ includeDetails }),
        transaction,
    });
}

async function getOwnedProjectOrThrow(projectId, userId, options = {}) {
    const project = await findOwnedProject(projectId, userId, options);

    if (!project) {
        throw new AppError('Проект не найден', 404);
    }

    return project;
}

export const getProjects = asyncHandler(async (req, res) => {
    const [subscriptionActive, projects] = await Promise.all([
        loadUserSubscriptionState(req.user.id),
        ValuationProject.findAll({
            where: { user_id: req.user.id },
            attributes: PROJECT_ATTRIBUTES,
            include: buildProjectInclude(),
            order: [['updated_at', 'DESC']],
        }),
    ]);

    return sendJson(
        res,
        projects.map((project) => attachProjectAccess(project, subscriptionActive))
    );
});

export const createProject = asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();

    if (!name) {
        throw new AppError('Название проекта обязательно', 400);
    }

    const payload = await sequelize.transaction(async (transaction) => {
        const project = await ValuationProject.create(
            {
                user_id: req.user.id,
                name,
                object_type: null,
                status: 'questionnaire',
            },
            { transaction }
        );

        await ProjectQuestionnaire.create(
            {
                project_id: project.id,
                projectName: name,
                calculationMethod: 'actual_market',
                objectType: null,
            },
            { transaction }
        );

        const [fullProject, subscriptionActive] = await Promise.all([
            getOwnedProjectOrThrow(project.id, req.user.id, { transaction }),
            loadUserSubscriptionState(req.user.id, transaction),
        ]);

        return attachProjectAccess(fullProject, subscriptionActive);
    });

    return sendJson(res, payload, 201);
});

export const getProjectById = asyncHandler(async (req, res) => {
    const [project, subscriptionActive] = await Promise.all([
        getOwnedProjectOrThrow(req.params.projectId, req.user.id, { includeDetails: true }),
        loadUserSubscriptionState(req.user.id),
    ]);

    return sendJson(res, attachProjectAccess(project, subscriptionActive));
});

export const updateProject = asyncHandler(async (req, res) => {
    const payload = await sequelize.transaction(async (transaction) => {
        const project = await ValuationProject.findOne({
            where: {
                id: req.params.projectId,
                user_id: req.user.id,
            },
            transaction,
        });

        if (!project) {
            throw new AppError('Проект не найден', 404);
        }

        await project.update(
            {
                name: req.body.name ?? project.name,
                object_type: req.body.object_type ?? project.object_type,
                status: req.body.status ?? project.status,
                payment_status: req.body.payment_status ?? project.payment_status,
            },
            { transaction }
        );

        const [updatedProject, subscriptionActive] = await Promise.all([
            getOwnedProjectOrThrow(project.id, req.user.id, { transaction }),
            loadUserSubscriptionState(req.user.id, transaction),
        ]);

        return attachProjectAccess(updatedProject, subscriptionActive);
    });

    return sendJson(res, payload);
});

export const deleteProject = asyncHandler(async (req, res) => {
    await sequelize.transaction(async (transaction) => {
        const project = await ValuationProject.findOne({
            where: {
                id: req.params.projectId,
                user_id: req.user.id,
            },
            transaction,
        });

        if (!project) {
            throw new AppError('Проект не найден', 404);
        }

        await ProjectQuestionnaire.destroy({
            where: { project_id: project.id },
            transaction,
        });

        await ProjectResult.destroy({
            where: { project_id: project.id },
            transaction,
        });

        await project.destroy({ transaction });
    });

    return sendJson(res, {
        success: true,
        message: 'Проект успешно удалён',
    });
});
