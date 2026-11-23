/**
 * 账号系统的鉴权公共库。
 *
 * 运行环境是 Cloudflare Workers（OpenNext），没有 Node 的 node:crypto，
 * 所以密码哈希与签名一律使用 Web Crypto（globalThis.crypto.subtle），
 * 本地 Node 22 同样可用。绝不引入 bcrypt / MD5 / SHA1。
 *
 * - 密码：PBKDF2-SHA256，随机 16 字节 salt，210000 次迭代。
 * - 登录态：HMAC-SHA256 签名的 Cookie，payload 内含 uid 与到期时间，
 *   前端读不到（HttpOnly），篡改后签名校验失败。
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';

// ─── 环境变量 ────────────────────────────────────────────────────────────

type EnvLike = Record<string, unknown>;

/** 取 Cloudflare 绑定环境变量（含 secret）。本地开发回退到 process.env。 */
export async function getEnv(): Promise<EnvLike> {
  try {
    const ctx = await getCloudflareContext();
    if (ctx?.env) return ctx.env as EnvLike;
  } catch {
    // 本地 next dev 无 Workers 上下文时回退
  }
  return (typeof process !== 'undefined' ? process.env : {}) as EnvLike;
}

/** 会话签名密钥。必须通过 Cloudflare secret / 环境变量 AUTH_SECRET 提供。 */
async function getSessionSecret(): Promise<string> {
  const env = await getEnv();
  const secret = env.AUTH_SECRET ?? env.SESSION_SECRET;
  if (typeof secret === 'string' && secret.length >= 16) return secret;
  throw new Error('AUTH_SECRET 未配置或过短（至少 16 字符）。请用 wrangler secret put AUTH_SECRET 设置。');
}

// ─── D1 类型（与项目现有风格一致，避免强依赖 @cloudflare/workers-types）───

type D1Prepared = {
  bind(...values: unknown[]): D1BoundStatement;
};
type D1BoundStatement = {
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
export type D1Like = { prepare(query: string): D1Prepared };

export async function getDb(): Promise<D1Like> {
  const env = await getEnv();
  const DB_NAMES = ['DB', 'D1', 'DATABASE', 'READINGS_DB', 'SHARD_INDEX_DB'];
  for (const name of DB_NAMES) {
    const value = env[name];
    if (value && typeof (value as D1Like).prepare === 'function') return value as D1Like;
  }
  for (const value of Object.values(env)) {
    if (value && typeof (value as D1Like).prepare === 'function') return value as D1Like;
  }
  throw new Error('D1 数据库绑定不可用，请检查 wrangler.toml 的 [[d1_databases]]。');
}

// ─── 编码工具 ────────────────────────────────────────────────────────────

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string) {
  const out = new Uint8Array(new ArrayBuffer(Math.floor(hex.length / 2)));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('当前运行环境不支持 Web Crypto（crypto.subtle）。');
  return c.subtle;
}

// ─── 密码哈希（PBKDF2） ──────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 210_000;

/** 生成随机 salt（16 字节，hex 字符串）。 */
export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** 用 PBKDF2-SHA256 派生密码哈希，返回 hex 字符串。 */
export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(bits);
}

/** 校验密码：用同样的 salt 重算哈希后恒定时间比较。 */
export async function verifyPassword(password: string, saltHex: string, expectedHex: string): Promise<boolean> {
  const actual = await hashPassword(password, saltHex);
  const a = fromHex(actual);
  const b = fromHex(expectedHex);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ─── 会话签名（HMAC-SHA256 Cookie） ─────────────────────────────────────

export const SESSION_COOKIE = 'xyzw_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

export type SessionPayload = { uid: number; exp: number };

async function hmacKey(): Promise<CryptoKey> {
  const secret = await getSessionSecret();
  return subtle().importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** 生成签名会话 token：base64url(payload).base64url(signature)。 */
export async function createSessionToken(uid: number): Promise<string> {
  const payload: SessionPayload = { uid, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await subtle().sign('HMAC', await hmacKey(), new TextEncoder().encode(body));
  return `${body}.${toBase64Url(sig)}`;
}

/** 校验会话 token，成功返回 uid，失败返回 null。 */
export async function verifySessionToken(token: string | undefined | null): Promise<number | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const expected = await subtle().sign('HMAC', await hmacKey(), new TextEncoder().encode(parts[0]));
    const provided = fromBase64Url(parts[1]);
    const exp = expected instanceof Uint8Array ? expected : new Uint8Array(expected);
    if (exp.length !== provided.length) return null;
    let diff = 0;
    for (let i = 0; i < exp.length; i++) diff |= exp[i] ^ provided[i];
    if (diff !== 0) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0]))) as SessionPayload;
    if (typeof payload.uid !== 'number' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

/** 生成 Set-Cookie 响应头（HttpOnly + Secure + SameSite=Lax）。 */
export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

/** 清除会话 Cookie 的响应头。 */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** 从请求里读取 Cookie 值。 */
export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

// ─── 当前用户 ────────────────────────────────────────────────────────────

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  salt: string;
  expires_at: string | null;
  free_used: number;
  created_at: string | null;
};

/** 读取当前登录用户，未登录返回 null。 */
export async function getCurrentUser(request: Request): Promise<UserRow | null> {
  const uid = await verifySessionToken(readCookie(request, SESSION_COOKIE));
  if (uid === null) return null;
  const db = await getDb();
  return db.prepare('SELECT id, username, password_hash, salt, expires_at, free_used, created_at FROM users WHERE id = ?')
    .bind(uid)
    .first<UserRow>();
}

/** 判断权益是否有效（付费且在有效期内）。 */
export function isPaidActive(user: Pick<UserRow, 'expires_at'> | null): boolean {
  if (!user?.expires_at) return false;
  const t = Date.parse(user.expires_at);
  return Number.isFinite(t) && t > Date.now();
}

// ─── Cloudflare Turnstile（可选） ────────────────────────────────────────

/**
 * 服务端校验 Turnstile token。若未配置 TURNSTILE_SECRET_KEY 则跳过（方便本地开发）；
 * 配置后注册/登录接口必须带上有效 token。token 5 分钟有效且只能用一次。
 */
export async function verifyTurnstile(token: string | null): Promise<{ ok: boolean; skipped: boolean }> {
  const env = await getEnv();
  const secret = env.TURNSTILE_SECRET_KEY;
  if (typeof secret !== 'string' || secret.length === 0) return { ok: true, skipped: true };
  if (!token) return { ok: false, skipped: false };
  try {
    const form = new URLSearchParams({ secret, response: token });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return { ok: data.success === true, skipped: false };
  } catch {
    return { ok: false, skipped: false };
  }
}
