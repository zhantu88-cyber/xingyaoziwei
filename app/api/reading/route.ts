import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

const SHARD_COUNT = 6;
const BUCKET_BINDINGS = Array.from({ length: SHARD_COUNT }, (_, i) => `R2_BUCKET_${i + 1}`);
const D1_BINDING_NAMES = ['DB', 'D1', 'DATABASE', 'READINGS_DB', 'SHARD_INDEX_DB'];
const CACHE_CONTROL = 'public, max-age=86400';

type D1Prepared = { bind(...values: unknown[]): { first<T = unknown>(): Promise<T | null> } };
type D1DatabaseLike = { prepare(query: string): D1Prepared };
type R2ObjectLike = { body: ReadableStream<Uint8Array> };
type R2BucketLike = { get(key: string): Promise<R2ObjectLike | null> };
type EnvLike = Record<string, unknown>;

function isD1(value: unknown): value is D1DatabaseLike {
  return !!value && typeof (value as D1DatabaseLike).prepare === 'function';
}
function isR2Bucket(value: unknown): value is R2BucketLike {
  return !!value && typeof (value as R2BucketLike).get === 'function';
}
function parseKey(raw: string | null): { key: string; year: number } | null {
  if (!raw) return null;
  const key = raw.trim();
  if (!/^\d{4}-/.test(key)) return null;
  if (/[\\/\x00-\x1f\x7f]/.test(key) || key.includes('..')) return null;
  return { key, year: Number(key.slice(0, 4)) };
}
function normalizeBinding(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const binding = value.trim();
  if (BUCKET_BINDINGS.includes(binding)) return binding;
  const match = binding.match(/(?:R2_BUCKET_|xingyaoziwei-shard-)(\d+)$/i);
  if (!match) return null;
  const shard = Number(match[1]);
  return shard >= 1 && shard <= SHARD_COUNT ? `R2_BUCKET_${shard}` : null;
}
function d1Candidates(env: EnvLike): D1DatabaseLike[] {
  const databases: D1DatabaseLike[] = [];
  const seen = new Set<unknown>();
  const add = (value: unknown) => {
    if (isD1(value) && !seen.has(value)) { seen.add(value); databases.push(value); }
  };
  for (const name of D1_BINDING_NAMES) add(env[name]);
  for (const value of Object.values(env)) add(value);
  return databases;
}
async function bucketFromShardIndex(env: EnvLike, year: number): Promise<string | null> {
  for (const db of d1Candidates(env)) {
    try {
      const row = await db.prepare('SELECT bucket_binding FROM shard_index WHERE year = ?')
        .bind(year).first<{ bucket_binding?: string | null }>();
      const binding = normalizeBinding(row?.bucket_binding);
      if (binding) return binding;
    } catch { /* not the shard index; try next */ }
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const parsed = parseKey(new URL(request.url).searchParams.get('k'));
  if (!parsed) {
    return Response.json({ error: 'Missing or invalid "k" query parameter' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const { key, year } = parsed;
  const { env } = await getCloudflareContext();
  const bindings = env as unknown as EnvLike;
  const preferred = await bucketFromShardIndex(bindings, year);
  const candidates = [...new Set([...(preferred ? [preferred] : []), ...BUCKET_BINDINGS])];
  const objectKey = `${key}.json.gz`;

  for (const binding of candidates) {
    const bucket = bindings[binding];
    if (!isR2Bucket(bucket)) continue;
    let object: R2ObjectLike | null;
    try { object = await bucket.get(objectKey); } catch { continue; }
    if (!object?.body) continue;
    const gzip = new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
    return new Response(object.body.pipeThrough(gzip), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': CACHE_CONTROL },
    });
  }

  return Response.json({ error: `Reading not found: ${key}` },
    { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
