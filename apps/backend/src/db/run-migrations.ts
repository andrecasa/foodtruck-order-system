import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '../../migrations');

function getConnectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'order_system',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  };
}

async function ensureMigrationsTable(pool: InstanceType<typeof Pool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(pool: InstanceType<typeof Pool>): Promise<Set<string>> {
  const result = await pool.query('SELECT name FROM _migrations ORDER BY name');
  return new Set(result.rows.map((row: { name: string }) => row.name));
}

async function getMigrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function runMigrations(): Promise<void> {
  const pool = new Pool(getConnectionConfig());

  try {
    console.log('[migrations] Connecting to database...');
    await ensureMigrationsTable(pool);

    const applied = await getAppliedMigrations(pool);
    const files = await getMigrationFiles();

    let count = 0;

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const filePath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(filePath, 'utf-8');

      console.log(`[migrations] Applying: ${file}`);
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      count++;
    }

    if (count === 0) {
      console.log('[migrations] All migrations already applied.');
    } else {
      console.log(`[migrations] Applied ${count} migration(s) successfully.`);
    }
  } catch (error) {
    console.error('[migrations] Error running migrations:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Allow running directly via: tsx src/db/run-migrations.ts
const isMainModule = process.argv[1] && (
  process.argv[1].includes('run-migrations') ||
  fileURLToPath(import.meta.url) === process.argv[1]
);

if (isMainModule) {
  runMigrations()
    .then(() => {
      console.log('[migrations] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrations] Failed:', err);
      process.exit(1);
    });
}
