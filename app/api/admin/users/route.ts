/**
 * 管理后台：用户查询。
 * GET /api/admin/users?q=关键字
 * 仅管理员可访问。返回用户的基本权益状态，供后台一键充值前确认。
 */

import { getCurrentUser, getDb } from '@/lib/auth';
import { availableCredits, hasTimePass } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';

type AdminUserRow = {
  id: number;
  username: string;
  credits: number;
  credits_expires_at: string | null;
  expires_at: string | null;
  created_at: string | null;
  is_admin: number;
};

export async function GET(request: Request): Promise<Response> {
  const admin = await getCurrentUser(request);
  if (!admin || admin.is_admin !== 1) {
    return Response.json({ error: '无权限访问' }, { status: 403 });
  }

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  const db = await getDb();

  // 有关键字按用户名模糊搜索，否则返回最近注册的 20 个，方便直接点。
  const rows = q
    ? await db
        .prepare(
          `SELECT id, username, credits, credits_expires_at, expires_at, created_at, is_admin
           FROM users WHERE username LIKE ? ORDER BY id DESC LIMIT 50`,
        )
        .bind(`%${q}%`)
        .all<AdminUserRow>()
    : await db
        .prepare(
          `SELECT id, username, credits, credits_expires_at, expires_at, created_at, is_admin
           FROM users ORDER BY id DESC LIMIT 20`,
        )
        .bind()
        .all<AdminUserRow>();

  const users = (rows.results ?? []).map((u) => ({
    id: u.id,
    username: u.username,
    rawCredits: u.credits,
    credits: availableCredits({
      credits: u.credits,
      credits_expires_at: u.credits_expires_at,
    }),
    creditsExpiresAt: u.credits_expires_at,
    hasTimePass: hasTimePass({ expires_at: u.expires_at }),
    expiresAt: u.expires_at,
    createdAt: u.created_at,
    isAdmin: u.is_admin === 1,
  }));

  return Response.json({ users }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
