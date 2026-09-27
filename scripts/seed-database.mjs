import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const dateKey = /(?:At|Date)$|^date$/i;
const naiveDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

export class SeedFailure extends Error {
  constructor(table, cause) {
    super('Seed table failed');
    this.table = table;
    this.code = /^P\d{4}$/.test(cause?.code ?? '') ? cause.code : undefined;
  }
}

function seedPath(root, file) {
  const target = resolve(root, file);
  if (!target.startsWith(`${resolve(root)}${sep}`)) throw new Error('Invalid seed path');
  return target;
}

async function loadRows(path) {
  const info = await stat(path);
  if (info.isDirectory()) {
    const files = (await readdir(path)).filter((file) => file.endsWith('.json')).sort();
    const rows = [];
    for (const file of files) rows.push(...await loadRows(seedPath(path, file)));
    return rows;
  }
  const rows = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('Invalid seed rows');
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid seed row');
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [
      key, typeof value === 'string' && dateKey.test(key) && naiveDate.test(value) ? `${value}Z` : value,
    ]));
  });
}

/** Insert only into empty tables, in config order, without changing existing records. */
export async function seedDatabase(prisma, seedDir) {
  const config = JSON.parse(await readFile(resolve(seedDir, 'config.json'), 'utf8'));
  if (!Array.isArray(config.tables) || !config.tables.length) throw new Error('Invalid seed config');
  const seen = new Set();
  for (const entry of config.tables) {
    if (!entry || !/^[A-Z][A-Za-z0-9]*$/.test(entry.table) || typeof entry.file !== 'string' || !entry.file || seen.has(entry.table)) {
      throw new Error('Invalid seed table');
    }
    seedPath(seedDir, entry.file);
    seen.add(entry.table);
  }
  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const { table, file } of config.tables) {
      const model = tx[table[0].toLowerCase() + table.slice(1)];
      if (!model || typeof model.count !== 'function' || typeof model.createMany !== 'function') throw new Error('Unknown seed model');
      const existing = await model.count();
      if (existing > 0) {
        results.push({ table, status: 'skipped-existing', rows: existing });
        continue;
      }
      // Do not require or parse a skipped table's file. Parent references are
      // resolved by PostgreSQL against both existing and newly seeded records.
      try {
        const rows = await loadRows(seedPath(seedDir, file));
        if (rows.length) await model.createMany({ data: rows });
        results.push({ table, status: rows.length ? 'inserted' : 'empty-seed', rows: rows.length });
      } catch (error) { throw new SeedFailure(table, error); }
    }
    return results;
  }, { maxWait: 15_000, timeout: 300_000, isolationLevel: 'Serializable' });
}
