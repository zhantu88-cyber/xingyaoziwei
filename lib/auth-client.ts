/**
 * 前端登录态工具（与 lib/auth.ts 服务端逻辑配套）。
 *
 * 微信内置浏览器对 HttpOnly cookie 的写入/回传不稳定（登录后刷新可能丢登录态），
 * 所以登录成功后把 session token 同时存入 localStorage，之后每个请求经 fetchAuth()
 * 自动带上 x-auth-token 头；服务端 getCurrentUser 优先认这个头。
 * 普通浏览器仍走 cookie，双轨不影响。
 */

const LS_KEY = 'auth_token';

export function saveAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(LS_KEY, token);
    else localStorage.removeItem(LS_KEY);
  } catch { /* 隐私模式等场景 localStorage 不可用时静默降级为只走 cookie */ }
}

export function loadAuthToken(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

/** 同 fetch，但自动附带 x-auth-token（如果已登录）。用法与原生 fetch 一致。 */
export async function fetchAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = loadAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('x-auth-token', token);
  return fetch(input, { ...init, headers });
}
