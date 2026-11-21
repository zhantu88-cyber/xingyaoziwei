#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');
const { promisify } = require('node:util');

const execAsync = promisify(exec);
const ROOT = path.resolve(__dirname, '..');
const BATCH_DIR = process.env.BATCH_DIR
  ? path.resolve(process.env.BATCH_DIR)
  : path.join(ROOT, 'data-batches');
const COMPLETED_FILE = path.join(BATCH_DIR, '.imported-batches.txt');
const LOG_DIR = path.join(ROOT, 'logs');
const ERROR_LOG = path.join(LOG_DIR, 'import-errors.log');
const DATABASE = process.env.D1_DATABASE || 'xingyaoziwei-db';
const MAX_RETRIES = Number.parseInt(process.env.IMPORT_MAX_RETRIES || '3', 10);
const EXEC_MAX_BUFFER = 8 * 1024 * 1024;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function listBatches() {
  return fs.readdirSync(BATCH_DIR)
    .filter((name) => /^batch_\d{4}_\d+\.sql$/i.test(name))
    .map((name) => {
      const match = name.match(/^batch_(\d{4})_(\d+)\.sql$/i);
      return { name, year: Number(match[1]), number: Number(match[2]) };
    })
    .sort((a, b) => a.year - b.year || a.number - b.number)
    .map((batch) => path.join(BATCH_DIR, batch.name));
}

function quoteForCmd(value) {
  // Generated batch names are constrained by listBatches() to a safe alphabet.
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function readCompletedBatches() {
  try {
    const contents = await fs.promises.readFile(COMPLETED_FILE, 'utf8');
    return new Set(contents.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
}

async function importOne(file) {
  const relativeFile = path.relative(ROOT, file).split(path.sep).join('/');
  const command = `npx wrangler d1 execute ${DATABASE} --remote --yes --file=${quoteForCmd(relativeFile)}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: ROOT,
        maxBuffer: EXEC_MAX_BUFFER,
        windowsHide: true,
      });
      if (stdout.trim()) process.stdout.write(stdout);
      if (stderr.trim()) process.stderr.write(stderr);
      console.log(`Imported ${path.basename(file)} (${attempt}/${MAX_RETRIES} attempt(s))`);
      return;
    } catch (error) {
      const detail = [
        `${new Date().toISOString()} ${path.basename(file)} attempt ${attempt}/${MAX_RETRIES}`,
        error.message,
        error.stdout,
        error.stderr,
      ].filter(Boolean).join('\n');
      await fs.promises.appendFile(ERROR_LOG, `${detail}\n\n`, 'utf8');

      if (attempt === MAX_RETRIES) throw new Error(`Import failed after ${MAX_RETRIES} attempts: ${file}`);
      const delay = Math.min(30_000, 1_000 * (2 ** (attempt - 1)));
      console.warn(`Import failed for ${path.basename(file)}; retrying in ${delay} ms (${attempt}/${MAX_RETRIES}).`);
      await sleep(delay);
    }
  }
}

async function main() {
  if (!Number.isInteger(MAX_RETRIES) || MAX_RETRIES < 1) {
    throw new Error('IMPORT_MAX_RETRIES must be a positive integer.');
  }
  if (!fs.existsSync(BATCH_DIR)) throw new Error(`Batch folder not found: ${BATCH_DIR}`);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const files = listBatches();
  if (!files.length) throw new Error(`No batch_YYYY_N.sql files found in ${BATCH_DIR}`);

  const completed = await readCompletedBatches();
  const pending = files.filter((file) => !completed.has(path.basename(file)));
  console.log(`Importing ${pending.length} of ${files.length} SQL files into D1 database ${DATABASE} in order.`);
  for (const file of files) {
    const name = path.basename(file);
    if (completed.has(name)) {
      console.log(`Skipping previously imported ${name}`);
      continue;
    }
    await importOne(file);
    await fs.promises.appendFile(COMPLETED_FILE, `${name}\n`, 'utf8');
    completed.add(name);
  }
  console.log('All D1 batch imports completed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
