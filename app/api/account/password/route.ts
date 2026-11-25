/** 已登录用户修改密码：需提供当前密码。 */

import { generateSalt, getCurrentUser, getDb, hashPassword, verifyPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Body = { currentPassword?: unknown; newPassword?: unknown };

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  if (typeof body.newPassword !== 'string' || body.newPassword.length < 8 || body.newPassword.length > 128) {
    return Response.json({ error: '新密码长度需为 8-128 位' }, { status: 400 });
  }
  if (typeof body.currentPassword !== 'string') {
    return Response.json({ error: '请输入当前密码' }, { status: 400 });
  }

  const ok = await verifyPassword(body.currentPassword, user.salt, user.password_hash);
  if (!ok) return Response.json({ error: '当前密码不正确' }, { status: 403 });

  const salt = generateSalt();
  const passwordHash = await hashPassword(body.newPassword, salt);
  const db = await getDb();
  await db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
    .bind(passwordHash, salt, user.id)
    .run();

  return Response.json({ ok: true, message: '密码已修改' });
}
