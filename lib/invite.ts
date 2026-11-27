/**
 * 邀请好友奖励：好友通过 `?ref=邀请人用户名` 注册成功后，
 *   - 新用户：注册送 1 次 + 邀请奖励 1 次 = 2 次
 *   - 邀请人：本周（ISO 周，周一重置）首次成功邀请 +1 次
 *
 * 防刷：invites 表以 invitee_id 为主键——每个新用户只能被算一次邀请；
 *       每个邀请人每周最多领一次奖励（靠 reward_week 判断）。
 */

import { extendCreditsExpiry } from '@/lib/entitlement';
import type { D1Like } from '@/lib/auth';

/** 返回 ISO 周标识，如 2026-W48（周一为一周起点）。 */
export function isoWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // 周日=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // 拿到本周四
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function normalizeInviteCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  return /^[a-z0-9_]{3,32}$/.test(name) ? name : null;
}

export type InviteResult = {
  invited: boolean;
  rewardGiven: boolean;
  inviteeBonus: number;
  inviterBonus: number;
};

/**
 * 在注册成功后调用。inviteeId 是新注册用户，inviteCode 是邀请人用户名。
 * 返回本次发放的额外额度信息。
 */
export async function applyInviteReward(
  db: D1Like,
  inviteeId: number,
  inviteCode: string | null,
  now: Date = new Date(),
): Promise<InviteResult> {
  const none: InviteResult = { invited: false, rewardGiven: false, inviteeBonus: 0, inviterBonus: 0 };
  if (!inviteCode) return none;

  const inviter = await db.prepare('SELECT id FROM users WHERE username = ?')
    .bind(inviteCode)
    .first<{ id: number }>();
  if (!inviter || inviter.id === inviteeId) return none;

  // 一个被邀请人只能被算一次（主键冲突即说明已邀请过）
  const week = isoWeek(now);
  const createdAt = now.toISOString();
  try {
    await db.prepare(
      'INSERT INTO invites (invitee_id, inviter_id, reward_week, created_at) VALUES (?, ?, ?, ?)',
    ).bind(inviteeId, inviter.id, week, createdAt).run();
  } catch {
    return none; // 已存在邀请关系，跳过
  }

  // 新用户 +1 次
  const invitee = await db.prepare('SELECT credits, credits_expires_at FROM users WHERE id = ?')
    .bind(inviteeId)
    .first<{ credits: number; credits_expires_at: string | null }>();
  let inviteeBonus = 0;
  if (invitee) {
    inviteeBonus = 1;
    await db.prepare('UPDATE users SET credits = ?, credits_expires_at = ? WHERE id = ?')
      .bind((invitee.credits ?? 0) + 1, extendCreditsExpiry(invitee.credits_expires_at), inviteeId)
      .run();
  }

  // 邀请人本周首次：+1 次
  let inviterBonus = 0;
  const weekCount = await db.prepare(
    'SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ? AND reward_week = ?',
  ).bind(inviter.id, week).first<{ n: number }>();
  if ((weekCount?.n ?? 0) === 1) {
    const inviterRow = await db.prepare('SELECT credits, credits_expires_at FROM users WHERE id = ?')
      .bind(inviter.id)
      .first<{ credits: number; credits_expires_at: string | null }>();
    if (inviterRow) {
      inviterBonus = 1;
      await db.prepare('UPDATE users SET credits = ?, credits_expires_at = ? WHERE id = ?')
        .bind((inviterRow.credits ?? 0) + 1, extendCreditsExpiry(inviterRow.credits_expires_at), inviter.id)
        .run();
    }
  }

  return { invited: true, rewardGiven: inviterBonus > 0, inviteeBonus, inviterBonus };
}
