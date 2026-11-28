#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { gunzipSync } = require('node:zlib');

const execFileAsync = promisify(execFile);
const DIMENSIONS = [
  'overview', 'personality', 'love', 'career', 'wealth', 'health', 'family',
  'children', 'move', 'friends', 'home', 'spirit', 'parents',
];
const key = process.argv[2];
const match = key?.match(/^(\d{4})-(\d{2})-(\d{2})-([0-9]|1[01])-(male|female)$/);

if (!match) {
  console.error('Usage: node scripts/verify-r2-reading.js YYYY-MM-DD-H-male|female');
  process.exit(1);
}

const year = Number(match[1]);
const bucketNumber = (year % 6) + 1;
const bucket = `xingyaoziwei-shard-${bucketNumber}`;
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xingyaoziwei-r2-'));
const downloadPath = path.join(temporaryDirectory, `${key}.json.gz`);

function preview(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return [...text].slice(0, 50).join('');
}

async function main() {
  console.log(`key: ${key}`);
  console.log(`bucket: ${bucket}  ((year % 6) + 1 = ${bucketNumber})`);

  const wranglerCli = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  await execFileAsync(process.execPath, [wranglerCli,
    'r2', 'object', 'get', `${bucket}/${key}.json.gz`,
    '--remote', '--file', downloadPath,
  ], { cwd: path.resolve(__dirname, '..'), windowsHide: true });

  const downloaded = fs.readFileSync(downloadPath);
  const isGzip = downloaded[0] === 0x1f && downloaded[1] === 0x8b;
  const parsed = JSON.parse((isGzip ? gunzipSync(downloaded) : downloaded).toString('utf8'));
  const content = parsed && typeof parsed.c === 'object' && parsed.c ? parsed.c : parsed;
  if (!content || typeof content !== 'object') throw new Error('R2 object is not a reading JSON object.');

  console.log(`stored key: ${typeof parsed.k === 'string' ? parsed.k : '(not present)'}`);
  console.log('--- dimension previews (first 50 characters) ---');
  for (const dimension of DIMENSIONS) {
    const value = typeof content[dimension] === 'string'
      ? content[dimension]
      : content[`text_${dimension}`];
    console.log(`${dimension.padEnd(12)} ${preview(value) || '(missing)'}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });
