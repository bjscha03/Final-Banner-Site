import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '');

const FREE_IMGS_PER_DAY = parseInt(process.env.FREE_IMGS_PER_DAY || '3', 10);

export async function ensureUser(userId: string, email?: string): Promise<void> {
  await sql`
    INSERT INTO users (id, email)
    VALUES (${userId}, ${email || null})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO user_credits (user_id, credits, last_reset_date)
    VALUES (${userId}, 0, CURRENT_DATE)
    ON CONFLICT (user_id) DO NOTHING
  `;
}

export async function getDailyFreeRemaining(userId: string): Promise<number> {
  await ensureUser(userId);
  await resetDailyCreditsIfNeeded(userId);

  const result = await sql`
    SELECT COUNT(*) as count
    FROM usage_log
    WHERE user_id = ${userId}
      AND event = 'GEN_SUCCESS'
      AND created_at >= CURRENT_DATE
      AND (meta->>'used_free')::boolean = true
  `;

  const usedToday = parseInt(result[0]?.count || '0', 10);
  return Math.max(0, FREE_IMGS_PER_DAY - usedToday);
}

export async function getPaidCredits(userId: string): Promise<number> {
  await ensureUser(userId);

  const result = await sql`
    SELECT credits
    FROM user_credits
    WHERE user_id = ${userId}
  `;

  return result[0]?.credits || 0;
}

export async function ensureCreditsOrFree(
  userId: string,
  requestedCount: number = 1
): Promise<{ canProceed: boolean; useFree: boolean; message?: string }> {
  const freeRemaining = await getDailyFreeRemaining(userId);
  const paidCredits = await getPaidCredits(userId);

  if (freeRemaining >= requestedCount) {
    return { canProceed: true, useFree: true };
  }

  if (paidCredits >= requestedCount) {
    return { canProceed: true, useFree: false };
  }

  return {
    canProceed: false,
    useFree: false,
    message: `Insufficient credits. You need ${requestedCount} credits but have ${paidCredits} paid credits and ${freeRemaining} free images remaining today.`,
  };
}

export async function debitCredits(userId: string, amount: number): Promise<void> {
  await sql`
    UPDATE user_credits
    SET credits = credits - ${amount}
    WHERE user_id = ${userId}
  `;
}

export async function addCredits(userId: string, amount: number): Promise<void> {
  await ensureUser(userId);

  await sql`
    UPDATE user_credits
    SET credits = credits + ${amount}
    WHERE user_id = ${userId}
  `;
}

export async function resetDailyCreditsIfNeeded(userId: string): Promise<void> {
  const result = await sql`
    SELECT last_reset_date
    FROM user_credits
    WHERE user_id = ${userId}
  `;

  if (!result[0]) {
    await ensureUser(userId);
    return;
  }

  const lastReset = new Date(result[0].last_reset_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (lastReset < today) {
    await sql`
      UPDATE user_credits
      SET last_reset_date = CURRENT_DATE
      WHERE user_id = ${userId}
    `;
  }
}

export async function logUsage(
  userId: string,
  event: string,
  meta: Record<string, any> = {}
): Promise<void> {
  await sql`
    INSERT INTO usage_log (user_id, event, meta)
    VALUES (${userId}, ${event}, ${JSON.stringify(meta)})
  `;
}

export async function getMonthlySpending(userId?: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let result;
  if (userId) {
    result = await sql`
      SELECT COALESCE(SUM((meta->>'cost')::numeric), 0) as total
      FROM usage_log
      WHERE user_id = ${userId}
        AND event = 'GEN_SUCCESS'
        AND created_at >= ${startOfMonth.toISOString()}
    `;
  } else {
    result = await sql`
      SELECT COALESCE(SUM((meta->>'cost')::numeric), 0) as total
      FROM usage_log
      WHERE event = 'GEN_SUCCESS'
        AND created_at >= ${startOfMonth.toISOString()}
    `;
  }

  return parseFloat(result[0]?.total || '0');
}
