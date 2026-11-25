import { getCurrentUser } from '@/lib/auth';
import { availableCredits, hasTimePass } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';

/** 前端判断"是否登录/剩余额度/权益"只能读这个接口，不能用 localStorage。 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser(request);
  return Response.json(
    {
      authenticated: !!user,
      user: user
        ? {
            id: user.id,
            username: user.username,
            // 时间包（7 天不限问）
            hasTimePass: hasTimePass(user),
            expiresAt: user.expires_at,
            // 次数包额度
            credits: availableCredits(user),
            rawCredits: user.credits,
            creditsExpiresAt: user.credits_expires_at,
            // 兼容旧字段：任一权益有效即视为已开通
            isPaid: hasTimePass(user) || availableCredits(user) > 0,
            freeUsed: user.free_used,
            // 管理员可进 /admin 后台一键充值
            isAdmin: user.is_admin === 1,
            // 找回密码用；null = 未绑定（老用户可登录后在账号页补绑）
            email: user.email,
          }
        : null,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
