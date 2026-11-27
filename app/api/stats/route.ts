/**
 * 站长数据看板接口。
 *
 * 鉴权：必须是登录用户，且用户名在白名单里（环境变量 STATS_ADMIN_USERS，
 * 逗号分隔，默认 "ove"）。不恢复 is_admin 管理员体系——谁看数据只由这里决定。
 *
 * 数据来源（全部是已有表，不新增埋点、不存排盘/访问数据）：
 *   users         → 注册用户
 *   usage_daily   → AI 问答次数 / token / 独立用户
 *   redeem_codes  → 兑换码使用情况（谁兑换了 = 谁买了码）
 */

import { getCurrentUser, getDb, getEnv } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type CountRow = { n: number };
type DayRow = { day: string; count: number; tokens: number };
type UserRow = { username: string; created_at: string | null };
type RedeemRow = {
  kind: string; credit_amount: number; duration_days: number;
  used_by: number | null; used_at: string | null; username: string | null;
  status: string;
};
type TopUserRow = { username: string; n: number; tokens: number };

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(request: Request): Promise<Response> {
  // 1. 鉴权
  const user = await getCurrentUser(request);
  if (!user) {
    return Response.json({ error: '请先登录' }, { status: 401 });
  }
  const env = await getEnv();
  const rawAllow = typeof env.STATS_ADMIN_USERS === 'string' && env.STATS_ADMIN_USERS
    ? env.STATS_ADMIN_USERS
    : 'ove';
  const allow = new Set(rawAllow.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  if (!allow.has(user.username.toLowerCase())) {
    return Response.json({ error: '无权访问' }, { status: 403 });
  }

  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = daysAgoISO(7);

  // 2. 用户
  const totalUsers = (await db.prepare('SELECT COUNT(*) AS n FROM users').bind().first<CountRow>())?.n ?? 0;
  const newToday = (await db.prepare('SELECT COUNT(*) AS n FROM users WHERE substr(created_at, 1, 10) = ?')
    .bind(today).first<CountRow>())?.n ?? 0;
  const newWeek = (await db.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?')
    .bind(weekAgo).first<CountRow>())?.n ?? 0;
  const recentUsers = (await db.prepare(
    'SELECT username, created_at FROM users ORDER BY id DESC LIMIT 8',
  ).bind().all<UserRow>()).results;

  // 3. AI 问答
  const allUsage = (await db.prepare(
    'SELECT day, count, tokens FROM usage_daily ORDER BY day ASC',
  ).bind().all<DayRow>()).results;
  const totalChats = allUsage.reduce((s, r) => s + (r.count || 0), 0);
  const totalTokens = allUsage.reduce((s, r) => s + (r.tokens || 0), 0);
  const chatUsers = new Set(
    (await db.prepare('SELECT DISTINCT user_id FROM usage_daily').bind().all<{ user_id: number }>()).results
      .map(r => r.user_id),
  ).size;
  const weekCutoff = daysAgoISO(7).slice(0, 10);
  // usage_daily 是「每用户每天」一行，趋势必须按天合并求和，否则同一天会出现多根柱子。
  const byDay = new Map<string, number>();
  for (const r of allUsage) {
    if (r.day < weekCutoff) continue;
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + (r.count || 0));
  }
  const dailyTrend = [...byDay.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const topUsers = (await db.prepare(
    `SELECT u.username, SUM(d.count) AS n, SUM(d.tokens) AS tokens
     FROM usage_daily d JOIN users u ON u.id = d.user_id
     GROUP BY u.id ORDER BY n DESC LIMIT 8`,
  ).bind().all<TopUserRow>()).results;

  // 4. 兑换码（用户自助兑换 = 实际购买）
  const redeemRows = (await db.prepare(
    `SELECT r.kind, r.credit_amount, r.duration_days, r.status, r.used_by, r.used_at, u.username
     FROM redeem_codes r LEFT JOIN users u ON u.id = r.used_by
     ORDER BY r.used_at DESC`,
  ).bind().all<RedeemRow>()).results;
  const used = redeemRows.filter(r => r.status === 'used');
  const byPackage: Record<string, number> = {};
  for (const r of used) {
    const name = r.kind === 'time'
      ? `${r.duration_days}天不限问`
      : `${r.credit_amount}次`;
    byPackage[name] = (byPackage[name] ?? 0) + 1;
  }
  const redeemHistory = used.slice(0, 12).map(r => ({
    username: r.username ?? `用户${r.used_by}`,
    package: r.kind === 'time' ? `${r.duration_days}天不限问` : `${r.credit_amount}次`,
    usedAt: r.used_at,
  }));

  return Response.json({
    users: { total: totalUsers, newToday, newWeek, recent: recentUsers },
    ai: { totalChats, totalTokens, chatUsers, dailyTrend, topUsers },
    redeem: {
      usedTotal: used.length,
      unusedTotal: redeemRows.length - used.length,
      byPackage,
      recent: redeemHistory,
    },
    generatedAt: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
