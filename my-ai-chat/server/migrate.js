/**
 * 数据库迁移脚本
 * 用法: cd server && node migrate.js
 */
import { db } from './db.js';
import fs from 'fs';
import path from 'path';

const migrationsDir = path.join(process.cwd(), 'migrations');

async function runMigration(file) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
  console.log(`[Migrate] Running ${file}...`);
  try {
    await db.query(sql);
    console.log(`[Migrate] ✅ ${file} completed`);
  } catch (err) {
    console.error(`[Migrate] ❌ ${file} failed:`, err.message);
    throw err;
  }
}

async function main() {
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`[Migrate] Found ${files.length} migration(s)`);

  for (const file of files) {
    await runMigration(file);
  }

  console.log('[Migrate] All migrations done');
  process.exit(0);
}

main().catch(err => {
  console.error('[Migrate] Fatal error:', err);
  process.exit(1);
});
