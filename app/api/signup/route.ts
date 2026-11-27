import {
  checkSignupQuota,
  getClientIp,
  SIGNUP_ALERT_PER_HOUR,
} from '@/lib/entitlement';
import { applyInviteReward, normalizeInviteCode } from '@/lib/invite';
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
  email?: unknown;
  turnstileToken?: unknown;
  ref?: unknown; // 邀请人用户名（来自分享链接 ?ref=xxx）
};

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  // 3-32 位：字母、数字、下划线
  if (!/^[a-z0-9_]{3,32}$/.test(name)) return null;
  return name;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 128) return null;
  return email;
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
  const email = normalizeEmail(body.email);
  if (!email) {
    return Response.json({ error: '请填写有效的邮箱地址（用于找回密码）' }, { status: 400 });
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
  const emailTaken = await db.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: number }>();
  if (emailTaken) {
    return Response.json({ error: '该邮箱已被注册' }, { status: 409 });
  }

  // 防养号：按注册 IP 统计近 24h 注册数，超阈值则注册成功但不送免费额度。
  const ip = getClientIp(request);
  const { grantFree, lastHour } = await checkSignupQuota(db, ip);
  if (lastHour >= SIGNUP_ALERT_PER_HOUR) {
    console.warn(`[signup-alert] ip=${ip} registered ${lastHour} accounts within 1 hour`);
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(body.password, salt);
  const createdAt = new Date().toISOString();
  const initialCredits = grantFree ? 1 : 0;

  await db.prepare(
    "INSERT INTO users (username, password_hash, salt, expires_at, credits, credits_expires_at, free_used, signup_ip, email, created_at) VALUES (?, ?, ?, NULL, ?, NULL, 0, ?, ?, ?)",
  ).bind(username, passwordHash, salt, initialCredits, ip, email, createdAt).run();

  const row = await db.prepare('SELECT id, username, password_hash, salt, expires_at, credits, credits_expires_at, last_chat_at, free_used, email, created_at FROM users WHERE username = ?')
    .bind(username)
    .first<UserRow>();
  if (!row) {
    return Response.json({ error: '注册后读取用户失败' }, { status: 500 });
  }

  // 邀请奖励：好友通过 ?ref=邀请人 链接注册成功 → 新用户 +1、邀请人本周首次 +1
  const invite = await applyInviteReward(db, row.id, normalizeInviteCode(body.ref), new Date(createdAt));
  const finalCredits = invite.inviteeBonus ? row.credits + invite.inviteeBonus : row.credits;

  const token = await createSessionToken(row.id);
  return Response.json(
    {
      user: {
        id: row.id,
        username: row.username,
        isPaid: isPaidActive(row),
        credits: finalCredits,
        freeUsed: row.free_used,
      },
      freeCreditGranted: grantFree,
      inviteBonus: invite.inviteeBonus,
      // 同 login：token 供前端存入 localStorage 走 x-auth-token 头（微信浏览器兼容）。
      token,
      turnstileSkipped: turnstile.skipped,
    },
    { status: 201, headers: { 'Set-Cookie': sessionCookieHeader(token), 'Cache-Control': 'no-store' } },
  );
}
