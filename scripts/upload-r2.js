#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let S3Client;
let PutObjectCommand;
try {
  ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
} catch {
  console.error('缺少依赖 @aws-sdk/client-s3，请先执行: npm install @aws-sdk/client-s3');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const R2_DIR = process.env.R2_DATA_DIR
  ? path.resolve(ROOT, process.env.R2_DATA_DIR)
  : path.join(ROOT, 'r2-data');
const HISTORY_FILE = process.env.R2_UPLOAD_HISTORY
  ? path.resolve(ROOT, process.env.R2_UPLOAD_HISTORY)
  : path.join(ROOT, 'upload-history.json');
const SHARD_COUNT = 6;
const BUCKETS = Array.from({ length: SHARD_COUNT }, (_, i) => `xingyaoziwei-shard-${i + 1}`);
const CONCURRENCY = Math.max(1, Number(process.env.R2_UPLOAD_CONCURRENCY) || 20);
const MAX_RETRIES = 3;
const HISTORY_FLUSH_EVERY = 50;

function loadConfig() {
  const required = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT'];
  const missing = required.filter((name) => !process.env[name] || !process.env[name].trim());
  if (missing.length) throw new Error(`缺少环境变量: ${missing.join(', ')}`);

  let endpoint = process.env.R2_ENDPOINT.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(endpoint)) endpoint = `https://${endpoint}`;

  return {
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim(),
    },
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// 必须与 pipeline-process.js 的 bucketBindingForYear 保持绝对一致：
//   bucket = (year % 6) + 1  ->  xingyaoziwei-shard-N
function bucketFor(fileName) {
  const match = fileName.match(/^(\d{4})-/);
  if (!match) throw new Error(`无法从文件名提取年份: ${fileName}`);
  const year = Number(match[1]);
  return `xingyaoziwei-shard-${(year % SHARD_COUNT) + 1}`;
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return new Set();
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (error) {
    throw new Error(`upload-history.json 解析失败，请检查或删除该文件: ${error.message}`);
  }
  const names = Array.isArray(parsed) ? parsed : (parsed?.files ?? []);
  return new Set(names.filter((name) => typeof name === 'string'));
}

function createHistorySaver(history) {
  let dirty = false;
  return {
    add(fileName) {
      history.add(fileName);
      dirty = true;
    },
    // 同步原子写：脚本是单线程，不存在并发写竞态；rename 保证文件不会被写坏。
    flush() {
      if (!dirty) return;
      const tmp = `${HISTORY_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...history].sort(), null, 2), 'utf8');
      fs.renameSync(tmp, HISTORY_FILE);
      dirty = false;
    },
  };
}

function createClient(config) {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: config.credentials,
    // AWS SDK >= 3.729 sends CRC32 / aws-chunked checksums by default, which
    // Cloudflare R2 rejects. Disable them explicitly.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 2,
  });
}

async function uploadOne(client, fileName) {
  const bucket = bucketFor(fileName);
  const body = await fs.promises.readFile(path.join(R2_DIR, fileName));
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: fileName,
    Body: body,
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
  });

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await client.send(command);
      return bucket;
    } catch (error) {
      lastError = error;
      const status = error?.$metadata?.httpStatusCode ?? 0;
      // 4xx (bad credentials, missing bucket) will never succeed on retry.
      if (status >= 400 && status < 500) break;
      if (attempt < MAX_RETRIES) await sleep(300 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`${fileName} -> ${bucket}: ${lastError?.message ?? String(lastError)}`);
}

async function main() {
  const config = loadConfig();
  if (!fs.existsSync(R2_DIR)) throw new Error(`目录不存在: ${R2_DIR}`);

  const allFiles = fs.readdirSync(R2_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json.gz'))
    .map((entry) => entry.name)
    .sort();
  if (!allFiles.length) throw new Error(`${R2_DIR} 中没有 .json.gz 文件`);

  const history = loadHistory();
  const saver = createHistorySaver(history);
  const pending = allFiles.filter((name) => !history.has(name));
  const skipped = allFiles.length - pending.length;
  const total = pending.length;
  const workers = Math.min(CONCURRENCY, total);
  console.log(`共 ${allFiles.length} 个文件 | 历史跳过 ${skipped} 个 | 待上传 ${total} 个 | ${BUCKETS.length} 个桶 | 并发 ${workers}`);

  const client = createClient(config);
  const counts = new Map(BUCKETS.map((bucket) => [bucket, 0]));
  const failures = [];
  let nextIndex = 0;
  let done = 0;
  let failed = 0;

  const report = () => {
    const line = `上传进度: ${done}/${total} (${((done / total) * 100).toFixed(1)}%) | 失败 ${failed}`;
    if (process.stdout.isTTY) process.stdout.write(`\r${line}`);
    else if (done % 100 === 0 || done === total) console.log(line);
  };

  const worker = async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= total) return;
      const fileName = pending[index];
      try {
        const bucket = await uploadOne(client, fileName);
        counts.set(bucket, counts.get(bucket) + 1);
        saver.add(fileName);
      } catch (error) {
        failed += 1;
        failures.push(error.message);
        console.error(`\n上传失败: ${error.message}`);
      }
      done += 1;
      if (done % HISTORY_FLUSH_EVERY === 0) saver.flush();
      report();
    }
  };

  if (total > 0) {
    await Promise.all(Array.from({ length: workers }, worker));
    if (process.stdout.isTTY) process.stdout.write('\n');
    console.log(`各桶数量: ${BUCKETS.map((bucket) => `${bucket}=${counts.get(bucket)}`).join('  ')}`);
  }
  saver.flush();

  if (failures.length) {
    console.error(`\n${failures.length} 个文件上传失败:`);
    for (const message of failures) console.error(`  - ${message}`);
    process.exitCode = 1;
    return;
  }

  console.log('所有文件上传成功');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
