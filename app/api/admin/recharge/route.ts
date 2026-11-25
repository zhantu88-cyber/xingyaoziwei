/**
 * 管理后台：一键充值。
 * POST /api/admin/recharge  { username, packageId }
 *
 * 场景：站长人工收款后，在后台搜到用户、选套餐、点确认，直接把权益加到该账号，
 * 用户刷新页面即可使用，无需再输入兑换码。
 *
 * 仅管理员可调用；每次充值写一条 recharge_logs 流水，便于对账。
 */

import { getCurrentUser, getDb } from '@/lib/auth';
import { extendCreditsExpiry, extendTimePass } from '@/lib/entitlement';
import { findPackage } from '@/lib/packages';

export const dynamic = 'force-dynamic';

type RechargeBody = { username?: unknown; packageId?: unknown };
type TargetRow = {
  id: number;
  username: string;
  credits: number;
  credits_expires_at: string | null;
  expires_at: string | null;
};

export async function POST(request: Request): Promise<Response> {
  const admin = await getCurrentUser(request);
  if (!admin || admin.is_admin !== 1) {
    return Response.json({ error: '无权限操作' }, { status: 403 });
  }

  let body: RechargeBody;
  try {
    body = (await request.json()) as RechargeBody;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const packageId = typeof body.packageId === 'string' ? body.packageId : '';
  if (!username) return Response.json({ error: '缺少用户名' }, { status: 400 });

  const pkg = findPackage(packageId);
  if (!pkg) return Response.json({ error: '套餐不存在' }, { status: 400 });

  const db = await getDb();
  const target = await db
    .prepare('SELECT id, username, credits, credits_expires_at, expires_at FROM users WHERE username = ?')
    .bind(username)
    .first<TargetRow>();
  if (!target) return Response.json({ error: `用户「${username}」不存在` }, { status: 404 });

  const now = new Date().toISOString();
  let newCredits: number | null = null;
  let newDays: number | null = null;

  if (pkg.kind === 'credits') {
    const amount = pkg.credits ?? 0;
    if (amount <= 0) return Response.json({ error: '套餐配置异常' }, { status: 500 });
    // 旧额度已过期则不再累加（否则用户会白得一批已失效的旧次数）。
    const expiryTs = target.credits_expires_at ? Date.parse(target.credits_expires_at) : Infinity;
    const stillValid = !target.credits_expires_at || (Number.isFinite(expiryTs) && expiryTs > Date.now());
    const base = stillValid ? (target.credits ?? 0) : 0;
    newCredits = base + amount;
    const newExpiry = extendCreditsExpiry(stillValid ? target.credits_expires_at : null);
    await db.prepare('UPDATE users SET credits = ?, credits_expires_at = ? WHERE id = ?')
      .bind(newCredits, newExpiry, target.id)
      .run();
  } else {
    const days = pkg.days ?? 0;
    if (days <= 0) return Response.json({ error: '套餐配置异常' }, { status: 500 });
    newDays = days;
    const newExpiry = extendTimePass(target.expires_at, days);
    await db.prepare('UPDATE users SET expires_at = ? WHERE id = ?').bind(newExpiry, target.id).run();
  }

  // 充值流水
  await db.prepare(
    `INSERT INTO recharge_logs
       (admin_id, admin_name, user_id, username, package_id, package_name, kind, credits, days, price, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      admin.id,
      admin.username,
      target.id,
      target.username,
      pkg.id,
      pkg.name,
      pkg.kind,
      newCredits ?? null,
      newDays ?? null,
      pkg.price,
      now,
    )
    .run();

  // 回读最新状态，供后台刷新展示
  const updated = await db
    .prepare('SELECT credits, credits_expires_at, expires_at FROM users WHERE id = ?')
    .bind(target.id)
    .first<{ credits: number; credits_expires_at: string | null; expires_at: string | null }>();

  return Response.json(
    {
      ok: true,
      username: target.username,
      packageName: pkg.name,
      price: pkg.price,
      credits: updated?.credits ?? newCredits,
      creditsExpiresAt: updated?.credits_expires_at ?? null,
      expiresAt: updated?.expires_at ?? null,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
