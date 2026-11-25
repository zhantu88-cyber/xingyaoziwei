/**
 * 找回密码第二步：校验令牌并设置新密码。
 */

import { generateSalt, getDb, hashPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(digest);
}

type ResetBody = { token?: unknown; password?: unknown };

export async function POST(request: Request): Promise<Response> {
  let body: ResetBody;
  try {
    body = (await request.json()) as ResetBody;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) {
    return Response.json({ error: '重置链接无效' }, { status: 400 });
  }
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
    return Response.json({ error: '密码长度需为 8-128 位' }, { status: 400 });
  }

  const db = await getDb();
  const tokenHash = await sha256(body.token);
  const row = await db
    .prepare('SELECT id, user_id, expires_at, used FROM password_resets WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ id: number; user_id: number; expires_at: string; used: number }>();

  if (!row || row.used === 1) {
    return Response.json({ error: '重置链接已失效，请重新发起找回' }, { status: 400 });
  }
  if (Number.isNaN(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now()) {
    return Response.json({ error: '重置链接已过期，请重新发起找回' }, { status: 400 });
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(body.password, salt);
  await db
    .prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
    .bind(passwordHash, salt, row.user_id)
    .run();
  // 一次性使用
  await db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(row.id).run();

  return Response.json({ ok: true, message: '密码已重置，请用新密码登录' });
}
