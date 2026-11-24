import {
  createSessionToken,
  getDb,
  isPaidActive,
  sessionCookieHeader,
  verifyPassword,
  verifyTurnstile,
  type UserRow,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

type LoginBody = {
  username?: unknown;
  password?: unknown;
  turnstileToken?: unknown;
};

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(name)) return null;
  return name;
}

export async function POST(request: Request): Promise<Response> {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const username = normalizeUsername(body.username);
  if (!username || typeof body.password !== 'string') {
    return Response.json({ error: '用户名或密码错误' }, { status: 401 });
  }

  const turnstile = await verifyTurnstile(
    typeof body.turnstileToken === 'string' ? body.turnstileToken : null,
  );
  if (!turnstile.ok) {
    return Response.json({ error: '人机验证失败，请重试' }, { status: 400 });
  }

  const db = await getDb();
  const row = await db.prepare(
    'SELECT id, username, password_hash, salt, expires_at, credits, credits_expires_at, last_chat_at, free_used, created_at FROM users WHERE username = ?',
  ).bind(username).first<UserRow>();

  // 用户不存在时也算一次哈希，缩短用户枚举的时间差。
  const passwordOk = await verifyPassword(
    body.password,
    row?.salt ?? '00'.repeat(16),
    row?.password_hash ?? '00'.repeat(32),
  );
  if (!row || !passwordOk) {
    return Response.json({ error: '用户名或密码错误' }, { status: 401 });
  }

  const token = await createSessionToken(row.id);
  return Response.json(
    {
      user: {
        id: row.id,
        username: row.username,
        isPaid: isPaidActive(row),
        credits: row.credits,
        freeUsed: row.free_used,
      },
      turnstileSkipped: turnstile.skipped,
    },
    { status: 200, headers: { 'Set-Cookie': sessionCookieHeader(token), 'Cache-Control': 'no-store' } },
  );
}
