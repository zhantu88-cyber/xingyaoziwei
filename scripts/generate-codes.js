#!/usr/bin/env node
/**
 * 批量生成兑换码（额度制 + 时间包）。
 *
 * 用法：
 *   node scripts/generate-codes.js <kind> <amount> <count> [prefix]
 *
 *   kind    credits = 次数包（amount 为次数，如 3 / 10 / 30）
 *           time    = 时间包（amount 为天数，新方案固定 7 天不限问）
 *   count   生成数量
 *   prefix  码前缀，默认 XYZW
 *
 * 示例：
 *   node scripts/generate-codes.js credits 10 50 CRED10   # 50 个「10 次」码
 *   node scripts/generate-codes.js credits 3 100 TRY3     # 100 个「3 次」体验码
 *   node scripts/generate-codes.js time 7 20 WEEK7        # 20 个「7 天不限问」码
 *
 * 输出：
 *   - codes-<时间戳>.txt     纯码列表，一行一个（发给用户用）
 *   - codes-<时间戳>.sql     可直接用 wrangler d1 execute 导入的 SQL
 *
 * 码形如 XXXX-AB3D-7K9Q，去掉易混淆的 0/O/1/I/L。
 * 注意：把码发给用户前，请妥善保管 .txt 文件，不要提交到 git（已在 .gitignore）。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const kind = (process.argv[2] || '').toLowerCase();
if (kind !== 'credits' && kind !== 'time') {
  console.error('用法: node scripts/generate-codes.js <credits|time> <amount> <count> [prefix]');
  console.error('  credits: amount=次数(3/10/30)  time: amount=天数(7)');
  process.exit(1);
}

const amount = Math.max(1, parseInt(process.argv[3], 10) || (kind === 'time' ? 7 : 10));
const count = Math.max(1, parseInt(process.argv[4], 10) || 10);
const prefix = (process.argv[5] || 'XYZW').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'XYZW';

if (kind === 'time' && amount !== 7) {
  console.warn(`提示：新方案时间包只有「7 天不限问」一档，你填的是 ${amount} 天。确认继续。`);
}

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

const durationDays = kind === 'time' ? amount : 0;
const creditAmount = kind === 'credits' ? amount : 0;

const sqlLines = [
  '-- 由 scripts/generate-codes.js 生成，导入：',
  `-- wrangler d1 execute xingyaoziwei-db --remote --file=./${sqlName}`,
  '',
  'INSERT INTO redeem_codes (code, kind, duration_days, credit_amount, status) VALUES',
  list.map((c) => `  ('${c}', '${kind}', ${durationDays}, ${creditAmount}, 'unused')`).join(',\n') + ';',
  '',
];
fs.writeFileSync(sqlName, sqlLines.join('\n'), 'utf8');

const label = kind === 'time' ? `${amount} 天不限问` : `${amount} 次额度`;
console.log(`已生成 ${count} 个兑换码（${label}）：`);
console.log(`  ${path.resolve(txtName)}`);
console.log(`  ${path.resolve(sqlName)}`);
console.log('\n前 5 个预览：');
list.slice(0, 5).forEach((c) => console.log('  ' + c));
console.log('\n导入命令：');
console.log(`  wrangler d1 execute xingyaoziwei-db --remote --file=./${sqlName}`);
