import { getCurrentUser, getDb } from '@/lib/auth';
import { extendCreditsExpiry, extendTimePass } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';

type RedeemBody = { code?: unknown };
type CodeRow = {
  code: string;
  kind: 'time' | 'credits';
  duration_days: number;
  credit_amount: number;
  status: string;
};

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  // 形如 XXXX-XXXX-XXXX，允许 8-64 位大写字母/数字/连字符
  if (!/^[A-Z0-9-]{8,64}$/.test(code)) return null;
  return code;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser(request);
  if (!user) {
    return Response.json({ error: '请先登录后再兑换' }, { status: 401 });
  }

  let body: RedeemBody;
  try {
    body = (await request.json()) as RedeemBody;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const code = normalizeCode(body.code);
  if (!code) {
    return Response.json({ error: '兑换码格式不正确' }, { status: 400 });
  }

  const db = await getDb();
  const row = await db.prepare(
    'SELECT code, kind, duration_days, credit_amount, status FROM redeem_codes WHERE code = ?',
  ).bind(code).first<CodeRow>();

  if (!row) {
    return Response.json({ error: '兑换码不存在' }, { status: 404 });
  }
  if (row.status !== 'unused') {
    return Response.json({ error: '该兑换码已被使用' }, { status: 409 });
  }

  // 乐观锁：仅当状态仍为 unused 时才标记 used，防止并发重复使用。
  const usedAt = new Date().toISOString();
  await db.prepare(
    "UPDATE redeem_codes SET status = 'used', used_by = ?, used_at = ? WHERE code = ? AND status = 'unused'",
  ).bind(user.id, usedAt, code).run();

  // 二次读取确认归属，确保并发下只有一人成功。
  const claimed = await db.prepare('SELECT used_by FROM redeem_codes WHERE code = ?')
    .bind(code)
    .first<{ used_by: number | null }>();
  if (!claimed || claimed.used_by !== user.id) {
    return Response.json({ error: '该兑换码已被使用' }, { status: 409 });
  }

  // 按码类型发放权益。
  if (row.kind === 'credits') {
    const amount = row.credit_amount;
    if (amount <= 0) {
      return Response.json({ error: '兑换码额度配置异常' }, { status: 500 });
    }
    const newCredits = (user.credits ?? 0) + amount;
    const newCreditsExpiry = extendCreditsExpiry(user.credits_expires_at);
    await db.prepare('UPDATE users SET credits = ?, credits_expires_at = ? WHERE id = ?')
      .bind(newCredits, newCreditsExpiry, user.id)
      .run();
    return Response.json(
      {
        ok: true,
        kind: 'credits',
        creditAmount: amount,
        credits: newCredits,
        creditsExpiresAt: newCreditsExpiry,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // 时间包（7 天不限问）
  const days = row.duration_days;
  if (days <= 0) {
    return Response.json({ error: '兑换码时长配置异常' }, { status: 500 });
  }
  const newExpiry = extendTimePass(user.expires_at, days);
  await db.prepare('UPDATE users SET expires_at = ? WHERE id = ?').bind(newExpiry, user.id).run();
  return Response.json(
    {
      ok: true,
      kind: 'time',
      expiresAt: newExpiry,
      durationDays: days,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
