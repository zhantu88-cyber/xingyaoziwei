import { clearSessionCookieHeader } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return Response.json(
    { ok: true },
    { status: 200, headers: { 'Set-Cookie': clearSessionCookieHeader(), 'Cache-Control': 'no-store' } },
  );
}
