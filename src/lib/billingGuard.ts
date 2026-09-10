import { getMonthlySpending } from './credits';
import type { Tier } from '@/types/ai-generation';

const MONTHLY_SOFT_CAP = parseFloat(process.env.IMG_MONTHLY_SOFT_CAP_USD || '100');

export async function checkMonthlyBudget(userId?: string): Promise<{
  exceeded: boolean;
  currentSpend: number;
  cap: number;
  percentUsed: number;
}> {
  const currentSpend = await getMonthlySpending(userId);
  const percentUsed = (currentSpend / MONTHLY_SOFT_CAP) * 100;

  return {
    exceeded: currentSpend >= MONTHLY_SOFT_CAP,
    currentSpend,
    cap: MONTHLY_SOFT_CAP,
    percentUsed,
  };
}

export async function enforceTierDowngrade(
  requestedTier: Tier,
  userId?: string
): Promise<{ tier: Tier; downgraded: boolean; reason?: string }> {
  const budget = await checkMonthlyBudget(userId);

  if (budget.exceeded && requestedTier === 'premium') {
    return {
      tier: 'standard',
      downgraded: true,
      reason: `Monthly budget of $${MONTHLY_SOFT_CAP} exceeded. Using Standard tier to control costs.`,
    };
  }

  return {
    tier: requestedTier,
    downgraded: false,
  };
}

export async function getMonthlySpendingSummary(userId?: string): Promise<{
  currentSpend: number;
  cap: number;
  percentUsed: number;
  remaining: number;
  status: 'ok' | 'warning' | 'exceeded';
}> {
  const budget = await checkMonthlyBudget(userId);
  const remaining = Math.max(0, budget.cap - budget.currentSpend);

  let status: 'ok' | 'warning' | 'exceeded' = 'ok';
  if (budget.exceeded) {
    status = 'exceeded';
  } else if (budget.percentUsed >= 80) {
    status = 'warning';
  }

  return {
    currentSpend: budget.currentSpend,
    cap: budget.cap,
    percentUsed: budget.percentUsed,
    remaining,
    status,
  };
}
