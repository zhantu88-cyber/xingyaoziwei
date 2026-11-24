import {
  createSessionToken,
  generateSalt,
  getDb,
  hashPassword,
  isPaidActive,
  sessionCookieHeader,
  verifyTurnstile,
  type UserRow,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

type SignupBody = {
  username?: unknown;
  password?: unknown;
  turnstileToken?: unknown;
};

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  // 3-32 位：字母、数字、下划线
  if (!/^[a-z0-9_]{3,32}$/.test(name)) return null;
  return name;
}

export async function POST(request: Request): Promise<Response> {
  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const username = normalizeUsername(body.username);
  if (!username) {
    return Response.json({ error: '用户名需为 3-32 位字母、数字或下划线' }, { status: 400 });
  }
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
    return Response.json({ error: '密码长度需为 8-128 位' }, { status: 400 });
  }

  const turnstile = await verifyTurnstile(
    typeof body.turnstileToken === 'string' ? body.turnstileToken : null,
  );
  if (!turnstile.ok) {
    return Response.json({ error: '人机验证失败，请重试' }, { status: 400 });
  }

  const db = await getDb();
  const existing = await db.prepare('SELECT id FROM users WHERE username = ?')
    .bind(username)
    .first<{ id: number }>();
  if (existing) {
    return Response.json({ error: '用户名已被占用' }, { status: 409 });
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(body.password, salt);
  const createdAt = new Date().toISOString();

  await db.prepare(
    "INSERT INTO users (username, password_hash, salt, expires_at, credits, credits_expires_at, free_used, created_at) VALUES (?, ?, ?, NULL, 1, NULL, 0, ?)",
  ).bind(username, passwordHash, salt, createdAt).run();

  const row = await db.prepare('SELECT id, username, password_hash, salt, expires_at, credits, credits_expires_at, last_chat_at, free_used, created_at FROM users WHERE username = ?')
    .bind(username)
    .first<UserRow>();
  if (!row) {
    return Response.json({ error: '注册后读取用户失败' }, { status: 500 });
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
    { status: 201, headers: { 'Set-Cookie': sessionCookieHeader(token), 'Cache-Control': 'no-store' } },
  );
}
