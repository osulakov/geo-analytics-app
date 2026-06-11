import type { Plugin } from 'vite';
import pg from 'pg';

// Default matches deployment_scripts/deploy_database.sh. Override with DATABASE_URL.
const DEFAULT_DATABASE_URL = 'postgresql://geo:geo_dev_password@localhost:5432/geo_analytics';

/**
 * Dev-only API: exposes GET /api/vessels, backed by the local Postgres
 * (static_vessel_info table). Keeps DB credentials on the server side — the
 * browser only ever talks to this endpoint, never to Postgres directly.
 */
export function vesselsApiPlugin(): Plugin {
  let pool: pg.Pool | null = null;
  const getPool = () => {
    if (!pool) {
      pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
      });
    }
    return pool;
  };

  return {
    name: 'vessels-api',
    configureServer(server) {
      server.middlewares.use('/api/vessels', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        try {
          const { rows } = await getPool().query(
            `SELECT mmsi, imo, vessel_name, callsign, flag_state, vessel_type,
                    length_m, width_m, draft_m
               FROM static_vessel_info
              ORDER BY vessel_name`,
          );

          // NUMERIC comes back as a string from pg — coerce to numbers.
          const num = (value: string | null) => (value === null ? null : Number(value));
          const vessels = rows.map((row) => ({
            mmsi: row.mmsi,
            imo: row.imo,
            vesselName: row.vessel_name,
            callsign: row.callsign,
            flagState: row.flag_state,
            vesselType: row.vessel_type,
            length: num(row.length_m),
            width: num(row.width_m),
            draft: num(row.draft_m),
          }));

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(vessels));
        } catch (error) {
          console.error('[vessels-api] query failed:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Failed to query static_vessel_info' }));
        }
      });
    },
  };
}
