/** 已登录用户绑定/更换邮箱（找回密码用）：需提供密码确认身份，邮箱全站唯一。 */

import { getCurrentUser, getDb, verifyPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Body = { email?: unknown; password?: unknown };

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 128) {
    return Response.json({ error: '请填写有效的邮箱地址' }, { status: 400 });
  }
  if (typeof body.password !== 'string') {
    return Response.json({ error: '请输入密码确认' }, { status: 400 });
  }

  const ok = await verifyPassword(body.password, user.salt, user.password_hash);
  if (!ok) return Response.json({ error: '密码不正确' }, { status: 403 });

  const db = await getDb();
  const taken = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
    .bind(email, user.id)
    .first<{ id: number }>();
  if (taken) return Response.json({ error: '该邮箱已被其他账号使用' }, { status: 409 });

  await db.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, user.id).run();
  return Response.json({ ok: true, message: '邮箱已绑定', email });
}
