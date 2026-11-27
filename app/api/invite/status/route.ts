/**
 * 查询当前用户的邀请状态：本周是否已领过邀请奖励、累计邀请成功人数。
 */
import { getCurrentUser, getDb } from '@/lib/auth';
import { isoWeek } from '@/lib/invite';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });

  const db = await getDb();
  const week = isoWeek();
  const thisWeek = await db.prepare(
    'SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ? AND reward_week = ?',
  ).bind(user.id, week).first<{ n: number }>();
  const total = await db.prepare(
    'SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ?',
  ).bind(user.id).first<{ n: number }>();

  return Response.json({
    week,
    redeemedThisWeek: (thisWeek?.n ?? 0) > 0,
    totalInvited: total?.n ?? 0,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
