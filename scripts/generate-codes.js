#!/usr/bin/env node
/**
 * 批量生成兑换码（密钥）。
 *
 * 用法：
 *   node scripts/generate-codes.js [数量] [有效天数] [前缀]
 *
 * 示例：
 *   node scripts/generate-codes.js 100 30 XYZW
 *
 * 输出：
 *   - codes-<时间戳>.txt     纯码列表，一行一个（发给用户用）
 *   - codes-<时间戳>.sql     可直接用 wrangler d1 execute 导入的 SQL
 *
 * 生成的码形如 XYZW-AB3D-7K9Q，去掉了易混淆的 0/O/1/I/L。
 * 注意：把码发给用户前，请自行妥善保管 .txt 文件，不要提交到 git。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const count = Math.max(1, parseInt(process.argv[2], 10) || 10);
const durationDays = Math.max(1, parseInt(process.argv[3], 10) || 30);
const prefix = (process.argv[4] || 'XYZW').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'XYZW';

// 去掉易混淆字符 0/O/1/I/L
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomBlock(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function makeCode() {
  return `${prefix}-${randomBlock(4)}-${randomBlock(4)}`;
}

const codes = new Set();
while (codes.size < count) codes.add(makeCode());

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const txtName = `codes-${stamp}.txt`;
const sqlName = `codes-${stamp}.sql`;

const list = [...codes];
fs.writeFileSync(txtName, list.join('\n') + '\n', 'utf8');

const sqlLines = [
  '-- 由 scripts/generate-codes.js 生成，导入：',
  `-- wrangler d1 execute xingyaoziwei-db --remote --file=./${sqlName}`,
  '',
  'INSERT INTO redeem_codes (code, duration_days, status) VALUES',
  list.map((c) => `  ('${c}', ${durationDays}, 'unused')`).join(',\n') + ';',
  '',
];
fs.writeFileSync(sqlName, sqlLines.join('\n'), 'utf8');

console.log(`已生成 ${count} 个兑换码（每个 ${durationDays} 天）：`);
console.log(`  ${path.resolve(txtName)}`);
console.log(`  ${path.resolve(sqlName)}`);
console.log('\n前 5 个预览：');
list.slice(0, 5).forEach((c) => console.log('  ' + c));
console.log('\n导入命令：');
console.log(`  wrangler d1 execute xingyaoziwei-db --remote --file=./${sqlName}`);
