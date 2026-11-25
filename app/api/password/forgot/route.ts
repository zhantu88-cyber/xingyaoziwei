/**
 * 找回密码第一步：校验 用户名+邮箱 匹配，生成重置令牌并发邮件。
 *
 * 安全设计：
 * - 无论账号是否存在/邮箱是否匹配，都返回相同的成功文案，不泄露账号信息；
 * - 令牌只存 SHA-256 哈希，明文只在邮件链接里出现一次；
 * - 令牌 30 分钟有效、一次性使用；
 * - 同账号的旧令牌在新令牌创建时全部作废（防并发多令牌）；
 * - 邮件发送失败（未配置 API key 等）返回明确错误，方便站长排查。
 */

import { getDb, verifyTurnstile } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 30 * 60 * 1000;

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return toHex(digest);
}

type ForgotBody = { username?: unknown; email?: unknown; turnstileToken?: unknown };

export async function POST(request: Request): Promise<Response> {
  let body: ForgotBody;
  try {
    body = (await request.json()) as ForgotBody;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!username || !email) {
    return Response.json({ error: '请填写用户名和邮箱' }, { status: 400 });
  }

  const turnstile = await verifyTurnstile(
    typeof body.turnstileToken === 'string' ? body.turnstileToken : null,
  );
  if (!turnstile.ok) {
    return Response.json({ error: '人机验证失败，请重试' }, { status: 400 });
  }

  const db = await getDb();
  const user = await db
    .prepare('SELECT id, username, email FROM users WHERE username = ?')
    .bind(username)
    .first<{ id: number; username: string; email: string | null }>();

  // 统一成功文案：不暴露"账号是否存在/邮箱是否匹配"
  const genericOk = { ok: true as const, message: '如果用户名与邮箱匹配，重置链接已发送，请在 30 分钟内查收邮件。' };

  if (!user || !user.email || user.email !== email) {
    return Response.json(genericOk);
  }

  // 作废该用户旧令牌
  await db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').bind(user.id).run();

  const tokenBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(tokenBytes);
  const token = toHex(tokenBytes);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await db
    .prepare('INSERT INTO password_resets (user_id, token_hash, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(user.id, tokenHash, expiresAt, new Date().toISOString())
    .run();

  const resetUrl = `https://xingyaoziwei.com/reset?token=${token}`;
  const sent = await sendEmail(
    user.email,
    '【星曜紫微】重置密码',
    `<div style="font-family:sans-serif;line-height:1.8">
      <p>你正在重置账号 <strong>${user.username}</strong> 的密码。</p>
      <p>请在 30 分钟内点击以下链接设置新密码（链接只能使用一次）：</p>
      <p><a href="${resetUrl}" style="color:#8a6a1f">${resetUrl}</a></p>
      <p style="color:#999;font-size:12px">如果这不是你的操作，请忽略本邮件，你的密码不会改变。</p>
    </div>`,
  );
  if (!sent.ok) {
    return Response.json(
      { error: sent.reason === 'not-configured' ? '邮件服务暂未开通，请联系站长处理' : '邮件发送失败，请稍后重试' },
      { status: 502 },
    );
  }

  return Response.json(genericOk);
}
