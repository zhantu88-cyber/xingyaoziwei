import { getCurrentUser, getDb } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type RedeemBody = { code?: unknown };

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  // 形如 XXXX-XXXX-XXXX，允许 8-64 位大写字母/数字/连字符
  if (!/^[A-Z0-9-]{8,64}$/.test(code)) return null;
  return code;
}

/** 在现有到期时间基础上顺延天数（续费叠加），返回新的 ISO 时间。 */
function extendExpiry(current: string | null, days: number): string {
  const now = Date.now();
  const base = current ? Date.parse(current) : 0;
  const start = Number.isFinite(base) && base > now ? base : now;
  return new Date(start + days * 24 * 60 * 60 * 1000).toISOString();
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
    'SELECT code, duration_days, status FROM redeem_codes WHERE code = ?',
  ).bind(code).first<{ code: string; duration_days: number; status: string }>();

  if (!row) {
    return Response.json({ error: '兑换码不存在' }, { status: 404 });
  }
  if (row.status !== 'unused') {
    return Response.json({ error: '该兑换码已被使用' }, { status: 409 });
  }

  // 乐观锁：仅当状态仍为 unused 时才标记 used，防止并发重复使用。
  const usedAt = new Date().toISOString();
  const claim = await db.prepare(
    "UPDATE redeem_codes SET status = 'used', used_by = ?, used_at = ? WHERE code = ? AND status = 'unused'",
  ).bind(user.id, usedAt, code).run();

  // D1 的 run() 返回值在没有 meta.changes 时无法判断影响行数，
  // 这里用二次读取确认归属，确保并发下只有一人成功。
  const claimed = await db.prepare('SELECT used_by FROM redeem_codes WHERE code = ?')
    .bind(code)
    .first<{ used_by: number | null }>();
  if (!claimed || claimed.used_by !== user.id) {
    return Response.json({ error: '该兑换码已被使用' }, { status: 409 });
  }
  void claim;

  const newExpiry = extendExpiry(user.expires_at, row.duration_days);
  await db.prepare('UPDATE users SET expires_at = ? WHERE id = ?').bind(newExpiry, user.id).run();

  return Response.json(
    {
      ok: true,
      expiresAt: newExpiry,
      durationDays: row.duration_days,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
