#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { createZstdDecompress } = require('node:zlib');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = process.env.PIPELINE_OUTPUT_DIR
  ? path.resolve(ROOT, process.env.PIPELINE_OUTPUT_DIR)
  : path.join(ROOT, 'data-batches');
const R2_DIR = process.env.PIPELINE_R2_DIR
  ? path.resolve(ROOT, process.env.PIPELINE_R2_DIR)
  : path.join(ROOT, 'r2-data');
const LOG_DIR = path.join(ROOT, 'logs');
const ERROR_LOG = path.join(LOG_DIR, 'pipeline-errors.log');

const ROWS_PER_BATCH_FILE = 2000;
const MAX_ROWS_PER_INSERT = 200;
// D1's statement limit is 100 KB. Keep headroom for SQL syntax and encoding.
const MAX_INSERT_BYTES = 90 * 1024;
const R2_WRITE_CONCURRENCY = 64;
const BUCKET_BINDINGS = 6;

const INDEX_INSERT_PREFIX = 'INSERT OR REPLACE INTO reading_index (k, y, m, d) VALUES\n';
const YEAR_FILE = /^year-(\d{4})\.(?:jsonl|zst|jsonl\.zst)$/i;
const YEAR_IN_NAME = /year-(\d{4})/i;
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;

// Compliance-only redaction: the 13 Markdown texts are kept verbatim (all
// headings, bold, lists, quotations, ancient-text derivations included).
const SENSITIVE_TERMS = [
  '倪海厦', '倪海廈', '倪师', '倪師',
  '倪老师', '倪老師', '倪医师', '倪醫師', '倪博士',
];
const SENSITIVE_PATTERN = new RegExp(SENSITIVE_TERMS.join('|'), 'g');

const DDL = [
  'CREATE TABLE IF NOT EXISTS reading_index (\n  k TEXT PRIMARY KEY,\n  y INTEGER NOT NULL,\n  m INTEGER NOT NULL,\n  d INTEGER NOT NULL\n);\n',
  'CREATE TABLE IF NOT EXISTS shard_index (\n  year INTEGER PRIMARY KEY,\n  bucket_binding TEXT NOT NULL\n);\n',
];

function sqlText(value) {
  if (value == null) return "''";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function bucketBindingForYear(year) {
  return `R2_BUCKET_${(year % BUCKET_BINDINGS) + 1}`;
}

function formatOf(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zst')) return 'zst';
  if (lower.endsWith('.jsonl')) return 'jsonl';
  return null;
}

function redactSensitive(value) {
  return String(value ?? '').replace(SENSITIVE_PATTERN, '古籍');
}

// The whole c object is preserved. Only string values are globally redacted;
// no trimming, no paragraph slicing, no Markdown stripping, no key deletion.
function sanitizeContent(content) {
  const cleaned = { ...content };
  for (const key of Object.keys(cleaned)) {
    if (typeof cleaned[key] === 'string') cleaned[key] = redactSensitive(cleaned[key]);
  }
  return cleaned;
}

function r2ObjectName(k) {
  return `${(k.replace(UNSAFE_FILENAME_CHARS, '_') || 'unnamed')}.json`;
}

async function writeR2Object(row) {
  const file = path.join(R2_DIR, r2ObjectName(row.k) + '.gz');
  try {
    const compressed = zlib.gzipSync(JSON.stringify(row.c));
    await fs.promises.writeFile(file, compressed);
  } catch (error) {
    throw new Error(`R2 write failed for ${row.k}: ${error.message}`, { cause: error });
  }
}

function makeIndexInsertStatements(rows) {
  const statements = [];
  let tuples = [];
  let bytes = Buffer.byteLength(INDEX_INSERT_PREFIX);

  for (const row of rows) {
    const tuple = `(${sqlText(row.k)}, ${row.y}, ${row.m}, ${row.d})`;
    const tupleBytes = Buffer.byteLength(tuple);
    if (
      Buffer.byteLength(INDEX_INSERT_PREFIX) + tupleBytes + 2 > MAX_INSERT_BYTES
    ) {
      throw new Error(`Index row too large for D1 statement limit: ${row.k}`);
    }
    const separator = tuples.length ? 2 : 0;
    if (
      tuples.length &&
      (tuples.length >= MAX_ROWS_PER_INSERT || bytes + separator + tupleBytes + 2 > MAX_INSERT_BYTES)
    ) {
      statements.push(`${INDEX_INSERT_PREFIX}${tuples.join(',\n')};\n`);
      tuples = [];
      bytes = Buffer.byteLength(INDEX_INSERT_PREFIX);
    }
    const sep = tuples.length ? 2 : 0;
    tuples.push(tuple);
    bytes += sep + tupleBytes;
  }

  if (tuples.length) statements.push(`${INDEX_INSERT_PREFIX}${tuples.join(',\n')};\n`);
  return statements;
}

function buildBatchSql(year, rows) {
  return [
    ...DDL,
    `INSERT OR IGNORE INTO shard_index (year, bucket_binding) VALUES (${year}, '${bucketBindingForYear(year)}');\n`,
    ...makeIndexInsertStatements(rows),
  ].join('\n');
}

function inputFromFile(file) {
  const name = path.basename(file);
  const format = formatOf(name);
  if (!format) {
    throw new Error(`Unsupported input file "${name}"; expected .jsonl, .zst or .jsonl.zst.`);
  }
  const match = name.match(YEAR_IN_NAME);
  if (!match) {
    throw new Error('Input filename must include its data year, for example year-2000.jsonl.');
  }
  return { file, year: Number(match[1]), name, format };
}

function collectYearFiles(directory) {
  const candidates = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && YEAR_FILE.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort();
  if (!candidates.length) throw new Error(`No year-YYYY.jsonl / .zst files found in ${directory}`);

  // One input per year: when both plain and compressed copies exist, the
  // sorted order puts the short .jsonl name first.
  const byYear = new Map();
  for (const candidate of candidates) {
    const info = inputFromFile(candidate);
    if (!byYear.has(info.year)) byYear.set(info.year, info);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

function findInputFiles(inputArgument) {
  if (!inputArgument) return collectYearFiles(ROOT);

  const target = path.resolve(process.cwd(), inputArgument);
  if (!fs.existsSync(target)) throw new Error(`Input file not found: ${target}`);
  if (fs.statSync(target).isDirectory()) return collectYearFiles(target);
  return [inputFromFile(target)];
}

function nextBatchNumber(year) {
  const prefix = new RegExp(`^batch_${year}_(\\d+)\\.sql$`);
  const existing = fs.readdirSync(OUTPUT_DIR)
    .map((name) => name.match(prefix))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return existing.length ? Math.max(...existing) + 1 : 1;
}

async function appendError(message) {
  await fs.promises.appendFile(ERROR_LOG, `${new Date().toISOString()} ${message}\n`, 'utf8');
}

class IndexBatchWriter {
  constructor(year) {
    this.year = year;
    this.nextNumber = nextBatchNumber(year);
    this.rows = [];
  }

  async add(row) {
    this.rows.push(row);
    if (this.rows.length >= ROWS_PER_BATCH_FILE) await this.flush();
  }

  async flush() {
    if (!this.rows.length) return;
    const number = this.nextNumber++;
    const file = path.join(OUTPUT_DIR, `batch_${this.year}_${number}.sql`);
    const sql = buildBatchSql(this.year, this.rows);
    await fs.promises.writeFile(file, sql, { encoding: 'utf8', flag: 'wx' });
    console.log(`Wrote ${this.rows.length} index rows: ${path.relative(ROOT, file)}`);
    this.rows = [];
  }

  async close() {
    await this.flush();
  }
}

function normalizedRow(raw, sourceYear, lineNumber) {
  if (
    !raw || typeof raw !== 'object' ||
    typeof raw.k !== 'string' || !raw.k ||
    !raw.c || typeof raw.c !== 'object' || Array.isArray(raw.c)
  ) {
    throw new Error(`invalid row structure at line ${lineNumber}`);
  }
  const year = Number(raw.y);
  const month = Number(raw.m);
  const day = Number(raw.d);
  if (
    year !== sourceYear ||
    !raw.k.startsWith(`${sourceYear}-`) ||
    !Number.isInteger(month) || month < 1 || month > 12 ||
    !Number.isInteger(day) || day < 1 || day > 31
  ) {
    throw new Error(`invalid or mismatched y/m/d at line ${lineNumber}`);
  }

  return { k: raw.k, y: year, m: month, d: day, c: sanitizeContent(raw.c) };
}

async function processFile(input) {
  if (input.format === 'zst' && typeof createZstdDecompress !== 'function') {
    throw new Error('This Node.js build does not expose zlib.createZstdDecompress(); use Node.js 22.15.0 or newer in the 22.x line.');
  }

  console.log(`Processing ${input.name}`);
  const compressed = fs.createReadStream(input.file);
  const source = input.format === 'zst' ? compressed.pipe(createZstdDecompress()) : compressed;
  source.setEncoding('utf8');
  const lines = readline.createInterface({ input: source, crlfDelay: Infinity });
  const writer = new IndexBatchWriter(input.year);
  let lineNumber = 0;
  let processed = 0;
  let skipped = 0;
  let r2Tasks = [];

  // Every queued task resolves (errors are returned as values), so no
  // unhandled rejection can escape before drainR2 inspects the batch.
  const queueR2 = (row) => {
    r2Tasks.push(writeR2Object(row).then(() => null, (error) => error));
  };
  const drainR2 = async () => {
    if (!r2Tasks.length) return;
    const tasks = r2Tasks;
    r2Tasks = [];
    const results = await Promise.all(tasks);
    const failure = results.find((result) => result instanceof Error);
    if (failure) throw failure;
  };

  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      let row;
      try {
        row = normalizedRow(JSON.parse(line), input.year, lineNumber);
      } catch (error) {
        skipped += 1;
        await appendError(`${input.name}:${lineNumber}: ${error.message}`);
        continue;
      }
      try {
        queueR2(row);
        if (r2Tasks.length >= R2_WRITE_CONCURRENCY) await drainR2();
        await writer.add(row);
      } catch (error) {
        await appendError(`${input.name}:${lineNumber}: ${error.message}`);
        throw error;
      }
      processed += 1;
      if (lineNumber % 100000 === 0) {
        console.log(`${input.name}: read ${lineNumber.toLocaleString()} lines; wrote ${processed.toLocaleString()} rows`);
      }
    }
    await drainR2();
    await writer.close();
  } catch (error) {
    lines.close();
    compressed.destroy();
    if (source !== compressed) source.destroy();
    await Promise.all(r2Tasks);
    try {
      await writer.close();
    } catch (closeError) {
      await appendError(`${input.name}: failed to flush index batch: ${closeError.message}`);
    }
    throw new Error(`${input.name} failed near line ${lineNumber}: ${error.message}`, { cause: error });
  }

  console.log(`Finished ${input.name}: ${processed.toLocaleString()} rows, ${skipped.toLocaleString()} skipped`);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(R2_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const files = findInputFiles(process.argv[2]);
  if (!files.length) throw new Error('No year-YYYY.jsonl / .zst files found.');

  for (const file of files) await processFile(file);
  console.log(`D1 index batches are in ${path.relative(ROOT, OUTPUT_DIR)}`);
  console.log(`R2 objects are in ${path.relative(ROOT, R2_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
