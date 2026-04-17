import { User, ValuationProject, ProjectQuestionnaire } from '../models/index.js';
import {
  SUBSCRIPTION_STATUS,
  PAYMENT_CURRENCY,
  PAYMENT_STATUS,
  addMonthsToDate,
  buildInvoiceNumber,
  buildSubscriptionInvoiceNumber,
  hasActiveSubscription,
} from '../constants/payment.js';
import { validateEmail } from '../utils/dataValidation.js';
import {
  BILLING_PLAN_KIND,
  getBillingCatalog,
  getBillingPlanByCode,
  getDefaultBillingPlan,
} from '../services/billingService.js';

async function resolveSelectedPlan(kind, code, activeItems) {
  const activeMatch = (activeItems || []).find((item) => item.code === code);
  if (activeMatch) {
    return activeMatch;
  }

  const persisted = await getBillingPlanByCode({
    kind,
    code,
    includeInactive: true,
  });

  if (persisted) {
    return persisted;
  }

  return getDefaultBillingPlan(kind);
}

async function serializeSubscription(user, subscriptionPlans = null) {
  const catalog = subscriptionPlans
    ? { subscriptionPlans }
    : await getBillingCatalog({ includeInactive: false });
  const selectedPlan = await resolveSelectedPlan(
    BILLING_PLAN_KIND.SUBSCRIPTION,
    user?.subscription_plan_code,
    catalog.subscriptionPlans
  );
  const details = user?.subscription_details_json || {};

  return {
    status: user?.subscription_status || SUBSCRIPTION_STATUS.INACTIVE,
    active: hasActiveSubscription(user),
    selectedPlanCode: selectedPlan?.code || null,
    startedAt: user?.subscription_started_at || null,
    expiresAt: user?.subscription_expires_at || null,
    invoiceNumber: details.invoiceNumber || null,
    invoiceEmail: details.invoiceEmail || null,
    plans: catalog.subscriptionPlans || [],
    plan: selectedPlan || null,
  };
}

async function serializePayment(project, questionnaire, user) {
  const catalog = await getBillingCatalog({ includeInactive: false });
  const selectedTariff = await resolveSelectedPlan(
    BILLING_PLAN_KIND.ONE_TIME,
    project.payment_tariff_code,
    catalog.oneTimeTariffs
  );
  const details = project.payment_details_json || {};
  const subscription = await serializeSubscription(user, catalog.subscriptionPlans);
  const accessGranted = subscription.active || project.payment_status === PAYMENT_STATUS.PAID;

  return {
    status: project.payment_status || PAYMENT_STATUS.UNPAID,
    selectedTariffCode: selectedTariff?.code || null,
    amount: Number(project.payment_amount ?? selectedTariff?.price ?? 0),
    currency: project.payment_currency || selectedTariff?.currency || PAYMENT_CURRENCY,
    paidAt: project.paid_at || null,
    invoiceNumber: details.invoiceNumber || null,
    invoiceEmail: details.invoiceEmail || null,
    tariff: selectedTariff || null,
    tariffs: catalog.oneTimeTariffs || [],
    scenarios: {
      oneTime: {
        available: true,
        accessGranted: project.payment_status === PAYMENT_STATUS.PAID,
      },
      subscription: {
        available: true,
        accessGranted: subscription.active,
      },
    },
    accessGranted,
    accessSource: subscription.active ? 'subscription' : project.payment_status === PAYMENT_STATUS.PAID ? 'one_time' : null,
    paymentStepRequired: !subscription.active,
    subscription,
    projectSummary: {
      projectName: questionnaire?.projectName || project.name,
      objectType: questionnaire?.objectType || project.object_type || null,
      address: questionnaire?.objectAddress || null,
      buildingCadastralNumber: questionnaire?.buildingCadastralNumber || null,
      totalArea: questionnaire?.totalArea || null,
    },
  };
}

async function getOwnedProject(projectId, userId) {
  return ValuationProject.findOne({
    where: {
      id: projectId,
      user_id: userId,
    },
    include: [
      {
        model: ProjectQuestionnaire,
        as: 'questionnaire',
        required: false,
      },
    ],
  });
}

async function getOwnedResources(projectId, userId) {
  const [project, user] = await Promise.all([
    getOwnedProject(projectId, userId),
    User.findByPk(userId, {
      attributes: [
        'id',
        'email',
        'subscription_status',
        'subscription_plan_code',
        'subscription_started_at',
        'subscription_expires_at',
        'subscription_details_json',
      ],
    }),
  ]);

  return { project, user };
}

export const getProjectPaymentInfo = async (req, res) => {
  try {
    const { project, user } = await getOwnedResources(req.params.projectId, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    return res.json(await serializePayment(project, project.questionnaire, user));
  } catch (error) {
    console.error('Ошибка получения данных оплаты:', error);
    return res.status(500).json({ error: 'Не удалось получить данные оплаты' });
  }
};

export const createProjectInvoice = async (req, res) => {
  try {
    const { project, user } = await getOwnedResources(req.params.projectId, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    const tariff = await getBillingPlanByCode({
      kind: BILLING_PLAN_KIND.ONE_TIME,
      code: req.body?.tariffCode,
      includeInactive: false,
    }) || await getDefaultBillingPlan(BILLING_PLAN_KIND.ONE_TIME);

    if (!tariff) {
      return res.status(400).json({ error: 'Нет доступных тарифов для единоразовой оплаты' });
    }

    const invoiceNumber = buildInvoiceNumber(project.id);
    const invoiceEmail = String(req.body?.invoiceEmail || req.user.email || '').trim().toLowerCase() || null;

    if (invoiceEmail) {
      const emailValidation = validateEmail(invoiceEmail);
      if (!emailValidation.valid) {
        return res.status(400).json({ error: emailValidation.error });
      }
    }

    await project.update({
      payment_status: PAYMENT_STATUS.PENDING,
      payment_tariff_code: tariff.code,
      payment_amount: tariff.price,
      payment_currency: tariff.currency || PAYMENT_CURRENCY,
      payment_details_json: {
        ...(project.payment_details_json || {}),
        invoiceNumber,
        invoiceEmail,
        tariffCode: tariff.code,
        issuedAt: new Date().toISOString(),
      },
    });

    return res.json({
      success: true,
      message: 'Счёт подготовлен',
      payment: await serializePayment(project, project.questionnaire, user),
    });
  } catch (error) {
    console.error('Ошибка подготовки счета:', error);
    return res.status(500).json({ error: 'Не удалось подготовить счёт' });
  }
};

export const confirmProjectPayment = async (req, res) => {
  try {
    const { project, user } = await getOwnedResources(req.params.projectId, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    const tariff = await resolveSelectedPlan(
      BILLING_PLAN_KIND.ONE_TIME,
      project.payment_tariff_code,
      []
    );

    await project.update({
      payment_status: PAYMENT_STATUS.PAID,
      payment_tariff_code: tariff?.code || project.payment_tariff_code,
      payment_amount: project.payment_amount ?? tariff?.price ?? 0,
      payment_currency: project.payment_currency || tariff?.currency || PAYMENT_CURRENCY,
      paid_at: new Date(),
      payment_details_json: {
        ...(project.payment_details_json || {}),
        paidAt: new Date().toISOString(),
        confirmedManually: true,
      },
    });

    return res.json({
      success: true,
      message: 'Оплата подтверждена',
      payment: await serializePayment(project, project.questionnaire, user),
    });
  } catch (error) {
    console.error('Ошибка подтверждения оплаты:', error);
    return res.status(500).json({ error: 'Не удалось подтвердить оплату' });
  }
};

export const createSubscriptionInvoice = async (req, res) => {
  try {
    const { project, user } = await getOwnedResources(req.params.projectId, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const plan = await getBillingPlanByCode({
      kind: BILLING_PLAN_KIND.SUBSCRIPTION,
      code: req.body?.planCode,
      includeInactive: false,
    }) || await getDefaultBillingPlan(BILLING_PLAN_KIND.SUBSCRIPTION);

    if (!plan) {
      return res.status(400).json({ error: 'Нет доступных планов подписки' });
    }

    const invoiceEmail = String(req.body?.invoiceEmail || user.email || '').trim().toLowerCase() || null;

    if (invoiceEmail) {
      const emailValidation = validateEmail(invoiceEmail);
      if (!emailValidation.valid) {
        return res.status(400).json({ error: emailValidation.error });
      }
    }

    await user.update({
      subscription_status: hasActiveSubscription(user)
        ? user.subscription_status
        : SUBSCRIPTION_STATUS.INACTIVE,
      subscription_plan_code: plan.code,
      subscription_details_json: {
        ...(user.subscription_details_json || {}),
        invoiceNumber: buildSubscriptionInvoiceNumber(user.id),
        invoiceEmail,
        planCode: plan.code,
        issuedAt: new Date().toISOString(),
      },
    });

    return res.json({
      success: true,
      message: 'Счёт на подписку подготовлен',
      payment: await serializePayment(project, project.questionnaire, user),
    });
  } catch (error) {
    console.error('Ошибка подготовки счёта на подписку:', error);
    return res.status(500).json({ error: 'Не удалось подготовить счёт на подписку' });
  }
};

export const confirmSubscriptionPayment = async (req, res) => {
  try {
    const { project, user } = await getOwnedResources(req.params.projectId, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const plan = await resolveSelectedPlan(
      BILLING_PLAN_KIND.SUBSCRIPTION,
      user.subscription_plan_code,
      []
    );

    if (!plan) {
      return res.status(400).json({ error: 'План подписки не найден' });
    }

    const startsAt = new Date();
    const expiresAt = addMonthsToDate(startsAt, plan.periodMonths);

    await user.update({
      subscription_status: SUBSCRIPTION_STATUS.ACTIVE,
      subscription_plan_code: plan.code,
      subscription_started_at: startsAt,
      subscription_expires_at: expiresAt,
      subscription_details_json: {
        ...(user.subscription_details_json || {}),
        paidAt: startsAt.toISOString(),
        confirmedManually: true,
      },
    });

    return res.json({
      success: true,
      message: 'Подписка активирована',
      payment: await serializePayment(project, project.questionnaire, user),
    });
  } catch (error) {
    console.error('Ошибка активации подписки:', error);
    return res.status(500).json({ error: 'Не удалось активировать подписку' });
  }
};
