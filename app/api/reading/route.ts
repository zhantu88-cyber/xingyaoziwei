import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

const DIMENSIONS = [
  'overview', 'personality', 'love', 'career', 'wealth', 'health', 'family',
  'children', 'move', 'friends', 'home', 'spirit', 'parents',
] as const;
const SHARD_COUNT = 6;
// Prevent intermediary transformations/compression on this JSON endpoint.
// Content-Encoding: identity is not a registered content coding; Cloudflare
// documents no-transform as the supported way to opt a response out.
const CACHE_CONTROL = 'public, max-age=86400, no-transform';

type Dimension = (typeof DIMENSIONS)[number];
type R2ObjectLike = { body: ReadableStream<Uint8Array> | null };
type R2BucketLike = { get(key: string): Promise<R2ObjectLike | null> };
type EnvLike = Record<string, unknown>;
type StoredReading = { k?: unknown; y?: unknown; m?: unknown; d?: unknown; c?: unknown; [key: string]: unknown };

function parseKey(raw: string | null): { key: string; year: number } | null {
  const key = raw?.trim() ?? '';
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})-([0-9]|1[01])-(male|female)$/);
  if (!match) return null;
  return { key, year: Number(match[1]) };
}

function bucketBindingForYear(year: number): `R2_BUCKET_${number}` {
  return `R2_BUCKET_${(year % SHARD_COUNT) + 1}`;
}

function isR2Bucket(value: unknown): value is R2BucketLike {
  return !!value && typeof (value as R2BucketLike).get === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeReading(raw: unknown, requestedKey: string, year: number): Record<string, string | number | null> | null {
  if (!isRecord(raw)) return null;
  const stored = raw as StoredReading;
  const content = isRecord(stored.c) ? stored.c : stored;
  const result: Record<string, string | number | null> = {
    k: typeof stored.k === 'string' ? stored.k : requestedKey,
    y: typeof stored.y === 'number' ? stored.y : year,
    m: typeof stored.m === 'number' ? stored.m : null,
    d: typeof stored.d === 'number' ? stored.d : null,
  };

  for (const dimension of DIMENSIONS) {
    const flat = stored[`text_${dimension}`];
    const value = typeof flat === 'string' ? flat : content[dimension];
    result[dimension] = typeof value === 'string' ? value : null;
  }
  return result;
}

async function readR2Json(body: ReadableStream<Uint8Array>): Promise<unknown> {
  const bytes = new Uint8Array(await new Response(body).arrayBuffer());
  // Some historical objects use a .json.gz suffix but contain plain JSON. Only
  // decompress files with the Gzip magic bytes 1F 8B; never guess by filename.
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = isGzip
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

export async function GET(request: Request): Promise<Response> {
  const parsed = parseKey(new URL(request.url).searchParams.get('k'));
  if (!parsed) {
    return Response.json(
      { error: 'Invalid "k"; expected YYYY-MM-DD-H-male or YYYY-MM-DD-H-female.' },
      { status: 400, headers: { 'Cache-Control': 'no-store, no-transform' } },
    );
  }

  const { key, year } = parsed;
  const binding = bucketBindingForYear(year);
  const { env } = await getCloudflareContext({ async: true });
  const bucket = (env as unknown as EnvLike)[binding];
  if (!isR2Bucket(bucket)) {
    console.error(`Missing R2 binding: ${binding}`);
    return Response.json({ error: 'Reading storage is not configured.' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, no-transform' },
    });
  }

  try {
    const object = await bucket.get(`${key}.json.gz`);
    if (!object?.body) {
      return Response.json({ error: `Reading not found: ${key}` }, {
        status: 404,
        headers: { 'Cache-Control': 'no-store, no-transform' },
      });
    }

    const raw = await readR2Json(object.body);
    const reading = normalizeReading(raw, key, year);
    if (!reading) throw new Error('R2 object does not contain a JSON object.');
    return Response.json(reading, { headers: { 'Cache-Control': CACHE_CONTROL } });
  } catch (error) {
    console.error(`Failed to read ${key} from ${binding}:`, error);
    return Response.json({ error: 'Failed to read the stored interpretation.' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store, no-transform' },
    });
  }
}
