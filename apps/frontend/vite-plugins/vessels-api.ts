import type { Plugin } from 'vite';
import pg from 'pg';

// Default matches deployment_scripts/deploy_database.sh. Override with DATABASE_URL.
const DEFAULT_DATABASE_URL = 'postgresql://geo:geo_dev_password@localhost:5432/geo_analytics';

const VESSEL_COLUMNS =
  'mmsi, imo, vessel_name, callsign, flag_state, vessel_type, length_m, width_m, draft_m';

const num = (value: string | null): number | null => (value === null ? null : Number(value));

function mapVessel(row: Record<string, string | null>) {
  return {
    mmsi: row.mmsi,
    imo: row.imo,
    vesselName: row.vessel_name,
    callsign: row.callsign,
    flagState: row.flag_state,
    vesselType: row.vessel_type,
    length: num(row.length_m),
    width: num(row.width_m),
    draft: num(row.draft_m),
  };
}

/**
 * Dev-only API backed by the local Postgres. Keeps DB credentials server-side;
 * the browser only ever talks to these endpoints.
 *
 *   GET /api/vessels         — all vessels (static_vessel_info)
 *   GET /api/vessels/:mmsi   — one vessel by MMSI
 *   GET /api/pings/latest    — the most recent ping per vessel (ais_pings)
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
      server.middlewares.use('/api', async (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }

        const { pathname } = new URL(req.url ?? '/', 'http://localhost');
        const json = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        try {
          if (pathname === '/vessels') {
            const { rows } = await getPool().query(
              `SELECT ${VESSEL_COLUMNS} FROM static_vessel_info ORDER BY vessel_name`,
            );
            json(200, rows.map(mapVessel));
            return;
          }

          const vesselMatch = pathname.match(/^\/vessels\/(\d{1,9})$/);
          if (vesselMatch) {
            const { rows } = await getPool().query(
              `SELECT ${VESSEL_COLUMNS} FROM static_vessel_info WHERE mmsi = $1`,
              [vesselMatch[1]],
            );
            if (rows.length === 0) {
              json(404, { error: 'Vessel not found' });
              return;
            }
            json(200, mapVessel(rows[0]));
            return;
          }

          if (pathname === '/pings/latest') {
            const { rows } = await getPool().query(
              `SELECT DISTINCT ON (mmsi)
                      mmsi,
                      ts,
                      ST_X(position::geometry) AS lon,
                      ST_Y(position::geometry) AS lat,
                      heading
                 FROM ais_pings
                ORDER BY mmsi, ts DESC`,
            );
            json(
              200,
              rows.map((row) => ({
                mmsi: row.mmsi,
                ts: row.ts,
                lon: Number(row.lon),
                lat: Number(row.lat),
                heading: num(row.heading),
              })),
            );
            return;
          }

          next();
        } catch (error) {
          console.error('[vessels-api] query failed:', error);
          json(500, { error: 'Database query failed' });
        }
      });
    },
  };
}
