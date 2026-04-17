import BillingPlan from '../models/BillingPlan.js';
import {
  PAYMENT_CURRENCY,
  PAYMENT_TARIFFS,
  SUBSCRIPTION_PLANS,
} from '../constants/payment.js';

export const BILLING_PLAN_KIND = Object.freeze({
  ONE_TIME: 'one_time',
  SUBSCRIPTION: 'subscription',
});

function normalizeFeatures(features) {
  if (!Array.isArray(features)) {
    return [];
  }

  return features
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

export function serializeBillingPlan(plan) {
  if (!plan) {
    return null;
  }

  const plain = typeof plan.toJSON === 'function' ? plan.toJSON() : plan;

  return {
    id: plain.id ?? null,
    kind: plain.kind,
    code: plain.code,
    title: plain.title,
    price: Number(plain.price || 0),
    currency: plain.currency || PAYMENT_CURRENCY,
    description: plain.description || '',
    features: normalizeFeatures(plain.features_json || plain.features),
    turnaround: plain.turnaround_text || plain.turnaround || null,
    periodMonths: plain.period_months ?? plain.periodMonths ?? null,
    isActive: plain.is_active ?? plain.isActive ?? true,
    sortOrder: Number(plain.sort_order ?? plain.sortOrder ?? 100),
    metadata: plain.metadata_json || plain.metadata || null,
    createdAt: plain.created_at || plain.createdAt || null,
    updatedAt: plain.updated_at || plain.updatedAt || null,
  };
}

function buildDefaultPlans() {
  const oneTime = PAYMENT_TARIFFS.map((tariff, index) => ({
    kind: BILLING_PLAN_KIND.ONE_TIME,
    code: tariff.code,
    title: tariff.title,
    price: tariff.price,
    currency: PAYMENT_CURRENCY,
    description: tariff.description,
    features_json: tariff.features,
    turnaround_text: tariff.turnaround,
    period_months: null,
    is_active: true,
    sort_order: index + 1,
    metadata_json: null,
  }));

  const subscription = SUBSCRIPTION_PLANS.map((plan, index) => ({
    kind: BILLING_PLAN_KIND.SUBSCRIPTION,
    code: plan.code,
    title: plan.title,
    price: plan.price,
    currency: PAYMENT_CURRENCY,
    description: plan.description,
    features_json: plan.features,
    turnaround_text: null,
    period_months: plan.periodMonths,
    is_active: true,
    sort_order: index + 1,
    metadata_json: null,
  }));

  return [...oneTime, ...subscription];
}

export async function ensureDefaultBillingPlans() {
  const defaults = buildDefaultPlans();

  for (const item of defaults) {
    const existing = await BillingPlan.findOne({
      where: {
        kind: item.kind,
        code: item.code,
      },
    });

    if (!existing) {
      await BillingPlan.create(item);
    }
  }
}

export async function getBillingPlans({ kind = null, includeInactive = false } = {}) {
  const where = {};

  if (kind) {
    where.kind = kind;
  }

  if (!includeInactive) {
    where.is_active = true;
  }

  const items = await BillingPlan.findAll({
    where,
    order: [
      ['kind', 'ASC'],
      ['sort_order', 'ASC'],
      ['price', 'ASC'],
      ['created_at', 'ASC'],
    ],
  });

  return items.map(serializeBillingPlan);
}

export async function getBillingCatalog({ includeInactive = false } = {}) {
  const items = await getBillingPlans({ includeInactive });

  return {
    items,
    oneTimeTariffs: items.filter((item) => item.kind === BILLING_PLAN_KIND.ONE_TIME),
    subscriptionPlans: items.filter((item) => item.kind === BILLING_PLAN_KIND.SUBSCRIPTION),
  };
}

export async function getBillingPlanByCode({ kind, code, includeInactive = true } = {}) {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode || !kind) {
    return null;
  }

  const where = {
    kind,
    code: normalizedCode,
  };

  if (!includeInactive) {
    where.is_active = true;
  }

  const item = await BillingPlan.findOne({ where });
  return serializeBillingPlan(item);
}

export async function getDefaultBillingPlan(kind) {
  const activeItems = await getBillingPlans({ kind, includeInactive: false });
  if (activeItems.length > 0) {
    return activeItems[0];
  }

  const fallbackCatalog = buildDefaultPlans()
    .filter((item) => item.kind === kind)
    .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0));

  return fallbackCatalog.length > 0 ? serializeBillingPlan(fallbackCatalog[0]) : null;
}

export function normalizeBillingPlanPayload(payload = {}) {
  return {
    kind: String(payload.kind || '').trim(),
    code: String(payload.code || '').trim(),
    title: String(payload.title || '').trim(),
    price: Number(payload.price || 0),
    currency: String(payload.currency || PAYMENT_CURRENCY).trim().toUpperCase() || PAYMENT_CURRENCY,
    description: String(payload.description || '').trim(),
    features_json: normalizeFeatures(payload.features),
    turnaround_text: payload.turnaround ? String(payload.turnaround).trim() : null,
    period_months: payload.periodMonths === null || payload.periodMonths === undefined || payload.periodMonths === ''
      ? null
      : Number(payload.periodMonths),
    is_active: payload.isActive !== false,
    sort_order: Number(payload.sortOrder || 100),
    metadata_json: payload.metadata ?? null,
  };
}
