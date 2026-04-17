import { sequelize } from '../config/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, Role } from '../models/index.js';
import {
  validateCredentials,
  validateEmail,
  validatePassword,
} from '../utils/dataValidation.js';
import {
  getUserByEmail,
  getDefaultUserRole,
  formatUserResponse,
  getUserWithRoles,
} from '../utils/userHelpers.js';
import { AUTH_CONFIG, ERROR_MESSAGES, USER_STATUS } from '../constants/auth.js';
import { normalizeUserSettings } from '../constants/userSettings.js';
import {
  addMonthsToDate,
  buildSubscriptionInvoiceNumber,
  hasActiveSubscription,
  SUBSCRIPTION_STATUS,
} from '../constants/payment.js';
import {
  BILLING_PLAN_KIND,
  getBillingCatalog,
  getBillingPlanByCode,
  getDefaultBillingPlan,
} from '../services/billingService.js';

async function resolveSelectedSubscriptionPlan(code, activePlans) {
  const activeMatch = (activePlans || []).find((item) => item.code === code);
  if (activeMatch) {
    return activeMatch;
  }

  const persisted = await getBillingPlanByCode({
    kind: BILLING_PLAN_KIND.SUBSCRIPTION,
    code,
    includeInactive: true,
  });

  if (persisted) {
    return persisted;
  }

  return getDefaultBillingPlan(BILLING_PLAN_KIND.SUBSCRIPTION);
}

async function serializeProfileSubscription(user) {
  const catalog = await getBillingCatalog({ includeInactive: false });
  const selectedPlan = await resolveSelectedSubscriptionPlan(
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
    plan: selectedPlan || null,
    plans: catalog.subscriptionPlans || [],
  };
}

export const registerUser = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { email, password, firstName, lastName } = req.body;

    // Validate credentials
    const validation = validateCredentials(email, password);
    if (!validation.valid) {
      await t.rollback();
      return res.status(400).json({ error: validation.error });
    }

    // Check if user exists and get default role in parallel
    const [existingUser, defaultRole] = await Promise.all([
      getUserByEmail(email, t),
      getDefaultUserRole(t),
    ]);

    if (existingUser) {
      await t.rollback();
      return res.status(400).json({
        error: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS,
      });
    }

    if (!defaultRole) {
      await t.rollback();
      return res.status(500).json({
        error: 'Роль USER не найдена в базе данных',
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      AUTH_CONFIG.BCRYPT_ROUNDS
    );

    const newUser = await User.create(
      {
        email,
        password_hash: hashedPassword,
        first_name: firstName || null,
        last_name: lastName || null,
        status: USER_STATUS.ACTIVE,
      },
      { transaction: t }
    );

    await newUser.addRole(defaultRole, { transaction: t });

    await t.commit();

    res.status(201).json({
      success: true,
      message: ERROR_MESSAGES.REGISTRATION_SUCCESS,
      user: {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
      },
    });
  } catch (error) {
    try {
      await t.rollback();
    } catch (rollbackError) {
      console.error('Ошибка откката транзакции:', rollbackError);
    }

    console.error('Ошибка регистрации:', error);
    res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.SERVER_ERROR,
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const validation = validateCredentials(email, password);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        error: ERROR_MESSAGES.INVALID_CREDENTIALS,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch || user.status !== USER_STATUS.ACTIVE) {
      return res.status(401).json({
        error: ERROR_MESSAGES.INVALID_CREDENTIALS,
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: AUTH_CONFIG.JWT_EXPIRY }
    );

    res.json({
      success: true,
      message: ERROR_MESSAGES.LOGIN_SUCCESS,
      token,
    });
  } catch (error) {
    console.error('Ошибка при входе:', error);
    res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.SERVER_ERROR,
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: [
        'id',
        'first_name',
        'last_name',
        'email',
        'status',
        'debug_mode',
        'created_at',
        'settings_json',
      ],
      include: [
        {
          model: Role,
          attributes: ['role'],
          through: { attributes: [] },
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    const formattedUser = formatUserResponse(user);

    return res.json({
      success: true,
      profile: formattedUser,
    });
  } catch (error) {
    console.error('getProfile error:', error);
    return res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.PROFILE_LOAD_ERROR,
    });
  }
};

export const updateProfileSettings = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'settings_json'],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    const requestedSettings =
      req.body?.settings && typeof req.body.settings === 'object'
        ? req.body.settings
        : req.body;

    const nextSettings = normalizeUserSettings({
      ...normalizeUserSettings(user.settings_json),
      ...requestedSettings,
    });

    await user.update({
      settings_json: nextSettings,
    });

    const updatedUser = await getUserWithRoles(req.user.id);

    return res.json({
      success: true,
      message: 'Настройки сохранены',
      profile: formatUserResponse(updatedUser),
    });
  } catch (error) {
    console.error('updateProfileSettings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Не удалось сохранить настройки',
    });
  }
};

export const updateUserEmail = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'email', 'password_hash', 'status'],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    const newEmail = String(req.body?.newEmail || '').trim().toLowerCase();
    const confirmEmail = String(req.body?.confirmEmail || '').trim().toLowerCase();
    const currentPassword = String(req.body?.currentPassword || '');

    const emailValidation = validateEmail(newEmail);
    if (!emailValidation.valid) {
      return res.status(400).json({
        success: false,
        error: emailValidation.error,
      });
    }

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        error: 'Введите текущий пароль',
      });
    }

    if (newEmail !== confirmEmail) {
      return res.status(400).json({
        success: false,
        error: 'Подтверждение email не совпадает',
      });
    }

    if (newEmail === String(user.email || '').trim().toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Новый email совпадает с текущим',
      });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatches) {
      return res.status(400).json({
        success: false,
        error: 'Текущий пароль указан неверно',
      });
    }

    const existingUser = await User.findOne({
      where: sequelize.where(
        sequelize.fn('lower', sequelize.col('email')),
        newEmail
      ),
      attributes: ['id'],
    });

    if (existingUser && existingUser.id !== user.id) {
      return res.status(400).json({
        success: false,
        error: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS,
      });
    }

    await user.update({
      email: newEmail,
    });

    const updatedUser = await getUserWithRoles(user.id);
    const token = jwt.sign(
      { id: updatedUser.id, email: updatedUser.email },
      process.env.JWT_SECRET,
      { expiresIn: AUTH_CONFIG.JWT_EXPIRY }
    );

    return res.json({
      success: true,
      message: 'Email успешно обновлён',
      token,
      profile: formatUserResponse(updatedUser),
    });
  } catch (error) {
    console.error('updateUserEmail error:', error);
    return res.status(500).json({
      success: false,
      error: 'Не удалось обновить email',
    });
  }
};

export const getProfileSubscription = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: [
        'id',
        'email',
        'subscription_status',
        'subscription_plan_code',
        'subscription_started_at',
        'subscription_expires_at',
        'subscription_details_json',
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    return res.json({
      success: true,
      subscription: await serializeProfileSubscription(user),
    });
  } catch (error) {
    console.error('getProfileSubscription error:', error);
    return res.status(500).json({
      success: false,
      error: 'Не удалось загрузить данные по подписке',
    });
  }
};

export const createProfileSubscriptionInvoice = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: [
        'id',
        'email',
        'subscription_status',
        'subscription_plan_code',
        'subscription_started_at',
        'subscription_expires_at',
        'subscription_details_json',
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    const plan = await getBillingPlanByCode({
      kind: BILLING_PLAN_KIND.SUBSCRIPTION,
      code: req.body?.planCode,
      includeInactive: false,
    }) || await getDefaultBillingPlan(BILLING_PLAN_KIND.SUBSCRIPTION);

    if (!plan) {
      return res.status(400).json({
        success: false,
        error: 'Нет доступных планов подписки',
      });
    }

    const invoiceEmail = String(req.body?.invoiceEmail || user.email || '').trim().toLowerCase() || null;

    if (invoiceEmail) {
      const emailValidation = validateEmail(invoiceEmail);
      if (!emailValidation.valid) {
        return res.status(400).json({
          success: false,
          error: emailValidation.error,
        });
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
      subscription: await serializeProfileSubscription(user),
    });
  } catch (error) {
    console.error('createProfileSubscriptionInvoice error:', error);
    return res.status(500).json({
      success: false,
      error: 'Не удалось подготовить счёт на подписку',
    });
  }
};

export const confirmProfileSubscriptionPayment = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: [
        'id',
        'email',
        'subscription_status',
        'subscription_plan_code',
        'subscription_started_at',
        'subscription_expires_at',
        'subscription_details_json',
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    const requestedPlanCode = String(req.body?.planCode || user.subscription_plan_code || '').trim();
    const plan = await resolveSelectedSubscriptionPlan(requestedPlanCode, []);

    if (!plan) {
      return res.status(400).json({
        success: false,
        error: 'План подписки не найден',
      });
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
        invoiceNumber: user.subscription_details_json?.invoiceNumber || buildSubscriptionInvoiceNumber(user.id),
        invoiceEmail: user.subscription_details_json?.invoiceEmail || user.email || null,
        planCode: plan.code,
        paidAt: startsAt.toISOString(),
        confirmedManually: true,
      },
    });

    return res.json({
      success: true,
      message: 'Подписка активирована',
      subscription: await serializeProfileSubscription(user),
    });
  } catch (error) {
    console.error('confirmProfileSubscriptionPayment error:', error);
    return res.status(500).json({
      success: false,
      error: 'Не удалось активировать подписку',
    });
  }
};
