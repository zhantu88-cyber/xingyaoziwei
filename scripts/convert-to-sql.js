const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const dimensions = [
  'overview', 'personality', 'love', 'career', 'wealth', 'health', 'family',
  'children', 'move', 'friends', 'home', 'spirit', 'parents',
];
const columns = ['k', ...dimensions.map(dimension => `text_${dimension}`)];
const inputPath = path.resolve(__dirname, '..', 'sample.jsonl');
const outputPath = path.resolve(__dirname, '..', 'sample.sql');

function quoteSql(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function write(output, text) {
  if (!output.write(text)) await new Promise(resolve => output.once('drain', resolve));
}

async function main() {
  const input = readline.createInterface({
    input: fs.createReadStream(inputPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  const output = fs.createWriteStream(outputPath, { encoding: 'utf8' });

  for await (const line of input) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (typeof row.k !== 'string' || !row.c || typeof row.c !== 'object') {
      throw new Error('Each row must include a string k and a c object.');
    }
    const values = [row.k, ...dimensions.map(dimension => row.c[dimension] ?? '')];
    const sql = `INSERT INTO readings (${columns.join(', ')}) VALUES (${values.map(quoteSql).join(', ')});\n`;
    await write(output, sql);
  }
  output.end();
  await new Promise((resolve, reject) => {
    output.once('finish', resolve);
    output.once('error', reject);
  });
  console.log(`Wrote SQL inserts to ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
