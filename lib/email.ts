/**
 * 发邮件（找回密码用）。
 *
 * 用 Resend 的 HTTP API（https://api.resend.com/emails），Cloudflare Workers
 * 里直接 fetch 即可，不需要 SMTP。免费档每天 100 封，找回密码场景绰绰有余。
 *
 * 需要配置 Workers secret：
 *   npx wrangler secret put RESEND_API_KEY
 * 未配置时 sendEmail 返回 { ok: false, reason: 'not-configured' }，
 * 调用方应提示"邮件服务未开通"而不是静默失败。
 */

import { getEnv } from '@/lib/auth';

type EmailResult = { ok: boolean; reason?: 'not-configured' | 'send-failed' };

export async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  const env = await getEnv();
  const key = env.RESEND_API_KEY;
  if (typeof key !== 'string' || key.length === 0) return { ok: false, reason: 'not-configured' };

  const from =
    typeof env.RESEND_FROM === 'string' && env.RESEND_FROM.length > 0
      ? env.RESEND_FROM
      : '星曜紫微 <onboarding@resend.dev>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false, reason: 'send-failed' };
  }
}
