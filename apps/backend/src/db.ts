import pg from 'pg';

// Same database the frontend's dev-server plugin talks to directly. The backend
// only owns auth-related tables (users); all geo data stays direct-from-DB.
const DEFAULT_DATABASE_URL = 'postgresql://geo:geo_dev_password@localhost:5432/geo_analytics';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
});

/** Create the auth-owned tables if they don't exist yet (run once on startup). */
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Per-user areas of interest. Coordinates are a JSON array of [lon, lat]
  // pairs (the polygon ring, without the closing duplicate point).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aois (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      coordinates JSONB NOT NULL,
      area_km2    DOUBLE PRECISION NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS aois_user_id_idx ON aois (user_id);
  `);

  // Per-user analysis jobs. analysis_config_id references a (client-side)
  // analysis config; aoi_wkt is the AOI the job ran against (NULL = global).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id                 BIGSERIAL PRIMARY KEY,
      user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name               TEXT NOT NULL,
      analysis_config_id TEXT NOT NULL,
      aoi_wkt            TEXT,
      from_ts            TIMESTAMPTZ,
      to_ts              TIMESTAMPTZ,
      event_count        INTEGER NOT NULL DEFAULT 0,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs (user_id);
  `);

  // Tag events with the job that produced them (events table is created by the
  // analyses scripts; add the column only if that table already exists).
  await pool.query(`
    ALTER TABLE IF EXISTS events
      ADD COLUMN IF NOT EXISTS job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE;
  `);
}
