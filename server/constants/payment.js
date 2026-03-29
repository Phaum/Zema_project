export const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'unpaid',
  PENDING: 'pending',
  PAID: 'paid',
});

export const SUBSCRIPTION_STATUS = Object.freeze({
  INACTIVE: 'inactive',
  ACTIVE: 'active',
  EXPIRED: 'expired',
});

export const PAYMENT_CURRENCY = 'RUB';

export const PAYMENT_TARIFFS = Object.freeze([
  {
    code: 'standard',
    title: 'Стандарт',
    price: 14900,
    turnaround: 'До 1 рабочего дня',
    description: 'Базовый расчет кадастровой стоимости с PDF-результатом и детальным breakdown.',
    features: [
      'Полный расчет по анкете и рыночным данным',
      'Детализированный результат с аналогами',
      'Экспорт в PDF',
    ],
  },
  {
    code: 'extended',
    title: 'Расширенный',
    price: 24900,
    turnaround: 'В приоритете',
    description: 'Расширенный сценарий для сложных объектов и повторной аналитики.',
    features: [
      'Все возможности тарифа Стандарт',
      'Приоритетная обработка внутри платформы',
      'Удобен для повторных пересчетов и сложных кейсов',
    ],
  },
  {
    code: 'portfolio',
    title: 'Портфельный',
    price: 39900,
    turnaround: 'Для серийной работы',
    description: 'Подходит для командной работы и интенсивных пересчетов внутри кабинета.',
    features: [
      'Все возможности тарифа Расширенный',
      'Удобен для серийных проектов и командной работы',
      'Фокус на ускоренный поток расчетов',
    ],
  },
]);

export const SUBSCRIPTION_PLANS = Object.freeze([
  {
    code: 'monthly',
    title: 'Месячная подписка',
    price: 29900,
    periodMonths: 1,
    description: 'Подходит для регулярной работы с несколькими объектами в течение месяца.',
    features: [
      'Неограниченный доступ к расчётам в рамках срока действия',
      'Повторные пересчёты без отдельной оплаты по проектам',
      'Удобно для аналитиков и проектных команд',
    ],
  },
  {
    code: 'quarterly',
    title: 'Квартальная подписка',
    price: 79900,
    periodMonths: 3,
    description: 'Сценарий для системной работы с потоком объектов и серийными пересчётами.',
    features: [
      'Все возможности месячной подписки',
      'Более выгодная стоимость на длительный период',
      'Хорошо подходит для серийной оценки',
    ],
  },
  {
    code: 'annual',
    title: 'Годовая подписка',
    price: 279000,
    periodMonths: 12,
    description: 'Максимальный сценарий для команд, постоянно работающих в платформе.',
    features: [
      'Все возможности квартальной подписки',
      'Длинный горизонт доступа без продления каждый месяц',
      'Подходит для постоянной внутренней эксплуатации',
    ],
  },
]);

export function getPaymentTariff(code) {
  return PAYMENT_TARIFFS.find((tariff) => tariff.code === code) || PAYMENT_TARIFFS[0];
}

export function getSubscriptionPlan(code) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.code === code) || SUBSCRIPTION_PLANS[0];
}

export function buildInvoiceNumber(projectId) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 12);

  return `ZEMA-${projectId}-${stamp}`;
}

export function buildSubscriptionInvoiceNumber(userId) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 12);

  return `ZEMA-SUB-${userId}-${stamp}`;
}

export function addMonthsToDate(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + Number(months || 0));
  return result;
}

export function hasActiveSubscription(user) {
  if (!user) return false;

  const status = user.subscription_status || SUBSCRIPTION_STATUS.INACTIVE;
  const expiresAt = user.subscription_expires_at
    ? new Date(user.subscription_expires_at)
    : null;

  if (status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return false;
  }

  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() > Date.now();
}
