import { getCurrentUser, isPaidActive } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** 前端判断"已开通/是否登录"只能读这个接口，不能用 localStorage。 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser(request);
  return Response.json(
    {
      authenticated: !!user,
      user: user
        ? {
            id: user.id,
            username: user.username,
            isPaid: isPaidActive(user),
            expiresAt: user.expires_at,
            freeUsed: user.free_used,
          }
        : null,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
