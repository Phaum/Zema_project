import { Op } from 'sequelize';
import User from '../../models/User.js';
import BillingPlan from '../../models/BillingPlan.js';
import { writeAdminAudit } from '../../utils/adminAudit.js';
import { sendError, sendNotFound, sendOk, sendServerError } from '../../utils/responseHelpers.js';
import { SUBSCRIPTION_STATUS, addMonthsToDate, hasActiveSubscription } from '../../constants/payment.js';
import {
  BILLING_PLAN_KIND,
  getBillingCatalog,
  getBillingPlanByCode,
  getDefaultBillingPlan,
  normalizeBillingPlanPayload,
  serializeBillingPlan,
} from '../../services/billingService.js';

function serializeSubscriptionAdminRow(user, plan) {
  const details = user?.subscription_details_json || {};

  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    fullName: [user.first_name, user.last_name].filter(Boolean).join(' ') || '—',
    status: user.subscription_status || SUBSCRIPTION_STATUS.INACTIVE,
    active: hasActiveSubscription(user),
    planCode: user.subscription_plan_code || null,
    planTitle: plan?.title || user.subscription_plan_code || '—',
    startedAt: user.subscription_started_at || null,
    expiresAt: user.subscription_expires_at || null,
    invoiceEmail: details.invoiceEmail || null,
    invoiceNumber: details.invoiceNumber || null,
    notes: details.notes || '',
  };
}

export async function getAdminBillingPlans(req, res) {
  try {
    const catalog = await getBillingCatalog({ includeInactive: true });

    return sendOk(res, {
      items: catalog.items,
      oneTimeTariffs: catalog.oneTimeTariffs,
      subscriptionPlans: catalog.subscriptionPlans,
    });
  } catch (error) {
    console.error('getAdminBillingPlans error:', error);
    return sendServerError(res, 'загрузки тарифов');
  }
}

export async function createAdminBillingPlan(req, res) {
  try {
    const payload = normalizeBillingPlanPayload(req.body);

    if (!Object.values(BILLING_PLAN_KIND).includes(payload.kind)) {
      return sendError(res, 'Недопустимый тип тарифа', 400);
    }

    if (!payload.code || !payload.title) {
      return sendError(res, 'Нужно указать code и title', 400);
    }

    if (!Number.isFinite(payload.price) || payload.price <= 0) {
      return sendError(res, 'Цена должна быть больше 0', 400);
    }

    if (payload.kind === BILLING_PLAN_KIND.SUBSCRIPTION) {
      if (!Number.isInteger(payload.period_months) || payload.period_months <= 0) {
        return sendError(res, 'Для подписки нужно указать periodMonths > 0', 400);
      }
      payload.turnaround_text = null;
    }

    if (payload.kind === BILLING_PLAN_KIND.ONE_TIME) {
      payload.period_months = null;
    }

    const exists = await BillingPlan.findOne({
      where: {
        kind: payload.kind,
        code: payload.code,
      },
    });

    if (exists) {
      return sendError(res, 'Вариант с таким кодом уже существует', 400);
    }

    const created = await BillingPlan.create(payload);

    await writeAdminAudit({
      adminUserId: req.user.id,
      entityType: 'billing_plan',
      entityId: created.id,
      action: 'create',
      beforeData: null,
      afterData: created.toJSON(),
    });

    return sendOk(res, serializeBillingPlan(created), 201);
  } catch (error) {
    console.error('createAdminBillingPlan error:', error);
    return sendServerError(res, 'создания тарифа');
  }
}

export async function updateAdminBillingPlan(req, res) {
  try {
    const plan = await BillingPlan.findByPk(req.params.id);

    if (!plan) {
      return sendNotFound(res, 'Тариф');
    }

    const payload = normalizeBillingPlanPayload({
      ...plan.toJSON(),
      ...req.body,
    });

    if (!Object.values(BILLING_PLAN_KIND).includes(payload.kind)) {
      return sendError(res, 'Недопустимый тип тарифа', 400);
    }

    if (!payload.code || !payload.title) {
      return sendError(res, 'Нужно указать code и title', 400);
    }

    if (!Number.isFinite(payload.price) || payload.price <= 0) {
      return sendError(res, 'Цена должна быть больше 0', 400);
    }

    if (payload.kind === BILLING_PLAN_KIND.SUBSCRIPTION) {
      if (!Number.isInteger(payload.period_months) || payload.period_months <= 0) {
        return sendError(res, 'Для подписки нужно указать periodMonths > 0', 400);
      }
      payload.turnaround_text = null;
    }

    if (payload.kind === BILLING_PLAN_KIND.ONE_TIME) {
      payload.period_months = null;
    }

    const duplicate = await BillingPlan.findOne({
      where: {
        id: { [Op.ne]: plan.id },
        kind: payload.kind,
        code: payload.code,
      },
    });

    if (duplicate) {
      return sendError(res, 'Вариант с таким кодом уже существует', 400);
    }

    const beforeData = plan.toJSON();
    await plan.update(payload);

    await writeAdminAudit({
      adminUserId: req.user.id,
      entityType: 'billing_plan',
      entityId: plan.id,
      action: 'update',
      beforeData,
      afterData: plan.toJSON(),
    });

    return sendOk(res, serializeBillingPlan(plan));
  } catch (error) {
    console.error('updateAdminBillingPlan error:', error);
    return sendServerError(res, 'обновления тарифа');
  }
}

export async function getAdminSubscriptions(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const planCode = String(req.query.planCode || '').trim();

    const where = {};
    const now = new Date();

    if (search) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (planCode) {
      where.subscription_plan_code = planCode;
    }

    if (status === SUBSCRIPTION_STATUS.ACTIVE) {
      where.subscription_status = SUBSCRIPTION_STATUS.ACTIVE;
      where.subscription_expires_at = { [Op.gt]: now };
    } else if (status === SUBSCRIPTION_STATUS.EXPIRED) {
      where[Op.and] = [
        {
          [Op.or]: [
            { subscription_status: SUBSCRIPTION_STATUS.EXPIRED },
            {
              subscription_status: SUBSCRIPTION_STATUS.ACTIVE,
              subscription_expires_at: { [Op.lte]: now },
            },
          ],
        },
      ];
    } else if (status === SUBSCRIPTION_STATUS.INACTIVE) {
      where.subscription_status = SUBSCRIPTION_STATUS.INACTIVE;
    }

    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: [
        'id',
        'email',
        'first_name',
        'last_name',
        'subscription_status',
        'subscription_plan_code',
        'subscription_started_at',
        'subscription_expires_at',
        'subscription_details_json',
      ],
      order: [
        ['subscription_expires_at', 'DESC'],
        ['created_at', 'DESC'],
      ],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    const planCodes = [...new Set(rows.map((item) => item.subscription_plan_code).filter(Boolean))];
    const plans = planCodes.length > 0
      ? await Promise.all(
        planCodes.map((code) => getBillingPlanByCode({
          kind: BILLING_PLAN_KIND.SUBSCRIPTION,
          code,
          includeInactive: true,
        }))
      )
      : [];
    const planMap = new Map(plans.filter(Boolean).map((plan) => [plan.code, plan]));

    return sendOk(res, {
      items: rows.map((user) => serializeSubscriptionAdminRow(
        user,
        planMap.get(user.subscription_plan_code) || null
      )),
      total: count,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('getAdminSubscriptions error:', error);
    return sendServerError(res, 'загрузки подписок');
  }
}

export async function updateAdminSubscription(req, res) {
  try {
    const user = await User.findByPk(req.params.userId);

    if (!user) {
      return sendNotFound(res, 'Пользователь');
    }

    const beforeData = user.toJSON();
    const requestedStatus = String(req.body?.status || user.subscription_status || SUBSCRIPTION_STATUS.INACTIVE).trim();

    if (!Object.values(SUBSCRIPTION_STATUS).includes(requestedStatus)) {
      return sendError(res, 'Недопустимый статус подписки', 400);
    }

    let planCode = String(req.body?.planCode || user.subscription_plan_code || '').trim() || null;
    let plan = null;

    if (planCode) {
      plan = await getBillingPlanByCode({
        kind: BILLING_PLAN_KIND.SUBSCRIPTION,
        code: planCode,
        includeInactive: true,
      });

      if (!plan) {
        return sendError(res, 'Указанный тариф подписки не найден', 400);
      }
    } else if (requestedStatus === SUBSCRIPTION_STATUS.ACTIVE) {
      plan = await getDefaultBillingPlan(BILLING_PLAN_KIND.SUBSCRIPTION);
      planCode = plan?.code || null;
    }

    let startedAt = req.body?.startedAt ? new Date(req.body.startedAt) : user.subscription_started_at;
    let expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : user.subscription_expires_at;

    if (requestedStatus === SUBSCRIPTION_STATUS.ACTIVE) {
      if (!startedAt || Number.isNaN(new Date(startedAt).getTime())) {
        startedAt = new Date();
      }

      if ((!expiresAt || Number.isNaN(new Date(expiresAt).getTime())) && plan?.periodMonths) {
        expiresAt = addMonthsToDate(startedAt, plan.periodMonths);
      }
    }

    if (requestedStatus === SUBSCRIPTION_STATUS.INACTIVE) {
      startedAt = null;
      expiresAt = null;
    }

    const nextDetails = {
      ...(user.subscription_details_json || {}),
    };

    if (Object.prototype.hasOwnProperty.call(req.body, 'invoiceEmail')) {
      nextDetails.invoiceEmail = req.body.invoiceEmail || null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
      nextDetails.notes = req.body.notes || '';
    }

    nextDetails.updatedByAdminAt = new Date().toISOString();
    nextDetails.updatedByAdminUserId = req.user.id;

    await user.update({
      subscription_status: requestedStatus,
      subscription_plan_code: planCode,
      subscription_started_at: startedAt,
      subscription_expires_at: expiresAt,
      subscription_details_json: nextDetails,
    });

    await writeAdminAudit({
      adminUserId: req.user.id,
      entityType: 'subscription',
      entityId: user.id,
      action: 'update',
      beforeData,
      afterData: user.toJSON(),
      meta: {
        targetEmail: user.email,
      },
    });

    return sendOk(res, serializeSubscriptionAdminRow(user, plan));
  } catch (error) {
    console.error('updateAdminSubscription error:', error);
    return sendServerError(res, 'обновления подписки');
  }
}
