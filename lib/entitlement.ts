/**
 * 权益与用量核心库：四层防护里的账号层 / 成本层 / 监控层。
 *
 * 收费模型（额度制为主 + 一档时间包）：
 *   - 时间包：expires_at 有效期内不限次数问答，不扣额度（7 天不限问档）。
 *   - 次数包：credits 为剩余次数，每次问答扣 1；credits_expires_at 为有效期
 *     （NULL=永久，注册赠送；购买次数包后 180 天）。
 *   - 时间包优先于次数包：有有效时间包时不消耗额度。
 *
 * 防护：
 *   - 每日硬上限 DAILY_LIMIT 对所有人生效（含时间包），防脚本刷量。
 *   - 最小请求间隔 MIN_CHAT_INTERVAL_MS 防瞬间连发。
 *   - 达到 ALERT_THRESHOLD 触发一次告警（监控层）。
 */

import { getDb, isPaidActive, type D1Like, type UserRow } from './auth';

export const DAILY_LIMIT = 100; // 每日问答硬上限（所有用户）
export const ALERT_THRESHOLD = 80; // 当日达到此次数触发一次告警（低于硬上限，提前发现异常）
export const MIN_CHAT_INTERVAL_MS = 3000; // 两次问答最小间隔（毫秒）
export const CREDIT_VALIDITY_DAYS = 180; // 次数包有效期（天）

// ─── 权益判断 ────────────────────────────────────────────────────────

/** 时间包（7 天不限问）是否生效。 */
export function hasTimePass(user: Pick<UserRow, 'expires_at'>): boolean {
  return isPaidActive(user);
}

/** 剩余可用额度（次数）。已过期视为 0。 */
export function availableCredits(user: Pick<UserRow, 'credits' | 'credits_expires_at'>): number {
  const credits = user.credits ?? 0;
  if (credits <= 0) return 0;
  if (!user.credits_expires_at) return credits; // NULL = 永久（注册赠送）
  const t = Date.parse(user.credits_expires_at);
  return Number.isFinite(t) && t > Date.now() ? credits : 0;
}

export type QuotaCheck =
  | { allowed: true; useTimePass: boolean }
  | { allowed: false; reason: string };

/** 账号层：判断是否有资格问答（时间包优先，否则看额度）。 */
export function checkQuota(user: UserRow): QuotaCheck {
  if (hasTimePass(user)) return { allowed: true, useTimePass: true };
  if (availableCredits(user) > 0) return { allowed: true, useTimePass: false };
  return {
    allowed: false,
    reason: '免费次数已用完。如需继续，请在「账号与兑换」页面使用兑换码充值或开通不限问。',
  };
}

/** 账号层：最小请求间隔限流，返回还需等待的毫秒数（0 表示可放行）。 */
export function rateLimitWaitMs(user: Pick<UserRow, 'last_chat_at'>): number {
  if (!user.last_chat_at) return 0;
  const last = Date.parse(user.last_chat_at);
  if (!Number.isFinite(last)) return 0;
  const elapsed = Date.now() - last;
  return Math.max(0, MIN_CHAT_INTERVAL_MS - elapsed);
}

// ─── 每日用量（成本层 + 监控层） ──────────────────────────────────────

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** 查询当日已用次数。 */
export async function getDailyCount(db: D1Like, userId: number, day = utcDay()): Promise<number> {
  const row = await db.prepare('SELECT count FROM usage_daily WHERE user_id = ? AND day = ?')
    .bind(userId, day)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * 成本层：扣额度 + 记用量。在 AI 调用成功后执行。
 * 返回当日累计次数与是否首次触及告警阈值。
 */
export async function consumeAndLog(
  db: D1Like,
  user: UserRow,
  useTimePass: boolean,
  tokens: number,
): Promise<{ dailyCount: number; shouldAlert: boolean }> {
  const now = new Date().toISOString();
  const day = utcDay();

  if (useTimePass) {
    await db.prepare('UPDATE users SET last_chat_at = ? WHERE id = ?').bind(now, user.id).run();
  } else {
    // 乐观锁：仅当仍有额度时才扣，防并发扣成负数。
    await db.prepare('UPDATE users SET credits = credits - 1, last_chat_at = ? WHERE id = ? AND credits > 0')
      .bind(now, user.id)
      .run();
  }

  await db.prepare(
    `INSERT INTO usage_daily (user_id, day, count, tokens) VALUES (?, ?, 1, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1, tokens = tokens + excluded.tokens`,
  ).bind(user.id, day, tokens).run();

  const dailyCount = await getDailyCount(db, user.id, day);

  // 恰好在达到告警阈值的那一次触发告警（每日一次，之后不再打扰）。
  // 用确定性等值判断，避免依赖 D1 run() 的 changes 元数据。
  const shouldAlert = dailyCount === ALERT_THRESHOLD;
  if (shouldAlert) {
    await db.prepare('UPDATE usage_daily SET alerted = 1 WHERE user_id = ? AND day = ?')
      .bind(user.id, day)
      .run();
  }

  return { dailyCount, shouldAlert };
}

// ─── 兑换：顺延计算 ──────────────────────────────────────────────────

/** 时间包顺延：在现有到期时间（若未过期）或当前时间基础上加天数。 */
export function extendTimePass(current: string | null, days: number): string {
  const now = Date.now();
  const base = current ? Date.parse(current) : 0;
  const start = Number.isFinite(base) && base > now ? base : now;
  return new Date(start + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 次数包有效期：在现有额度有效期（若未过期）或当前时间基础上加 CREDIT_VALIDITY_DAYS。
 * 现有为永久（NULL）时，从当前时间起算 180 天（购买后统一纳入有效期管理）。
 */
export function extendCreditsExpiry(current: string | null): string {
  const now = Date.now();
  const base = current ? Date.parse(current) : 0;
  const start = Number.isFinite(base) && base > now ? base : now;
  return new Date(start + CREDIT_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
