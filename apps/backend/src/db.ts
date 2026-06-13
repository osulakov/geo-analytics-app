import pg from 'pg';

// Same database the frontend's dev-server plugin talks to directly. The backend
// only owns auth-related tables (users); all geo data stays direct-from-DB.
const DEFAULT_DATABASE_URL = 'postgresql://geo:geo_dev_password@localhost:5432/geo_analytics';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
});

/** Create the users table if it doesn't exist yet (run once on startup). */
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
