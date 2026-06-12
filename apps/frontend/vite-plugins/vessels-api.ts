import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import pg from 'pg';

// Default matches deployment_scripts/deploy_database.sh. Override with DATABASE_URL.
const DEFAULT_DATABASE_URL = 'postgresql://geo:geo_dev_password@localhost:5432/geo_analytics';

/** Read and JSON-parse a request body. */
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Build a viewport spherical-cap condition from ?lon&lat&radius (metres),
 * appending the params to `values`. Returns null when no viewport is given.
 */
function capCondition(url: URL, values: unknown[]): string | null {
  const lon = url.searchParams.get('lon');
  const lat = url.searchParams.get('lat');
  const radius = url.searchParams.get('radius');
  if (lon === null || lat === null || radius === null) return null;
  values.push(lon, lat, radius);
  const n = values.length;
  return `ST_DWithin(position, ST_SetSRID(ST_MakePoint($${n - 2}::float8, $${n - 1}::float8), 4326)::geography, $${n}::float8)`;
}

interface GroupRow {
  id: number;
  name: string;
  mmsis: string[] | null;
}

function mapGroup(row: GroupRow) {
  return { id: row.id, name: row.name, mmsis: row.mmsis ?? [] };
}

const VESSEL_COLUMNS =
  'mmsi, imo, vessel_name, callsign, flag_state, vessel_type, length_m, width_m, draft_m';

const num = (value: string | null): number | null => (value === null ? null : Number(value));

function mapSatellite(row: Record<string, string | null>) {
  return {
    name: row.name,
    constellation: row.constellation,
    altitudeKm: num(row.altitude_km),
    inclinationDeg: num(row.inclination_deg),
    orbitalPeriodMin: num(row.orbital_period_min),
    swathWidthKm: num(row.swath_width_km),
    groundVelocityKmSec: num(row.ground_velocity_km_sec),
    lookAngleDeg: num(row.look_angle_deg),
    raanDeg: num(row.raan_deg),
    meanAnomalyDeg: num(row.mean_anomaly_deg),
  };
}

const SATELLITE_COLUMNS =
  'name, constellation, altitude_km, inclination_deg, orbital_period_min, ' +
  'swath_width_km, ground_velocity_km_sec, look_angle_deg, raan_deg, mean_anomaly_deg';

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

  // Lazily create the vessel_groups table (groups are user-created at runtime).
  let groupsReady: Promise<void> | null = null;
  const ensureGroups = () => {
    if (!groupsReady) {
      groupsReady = getPool()
        .query(
          `CREATE TABLE IF NOT EXISTS vessel_groups (
             id         SERIAL PRIMARY KEY,
             name       TEXT NOT NULL,
             mmsis      TEXT[] NOT NULL DEFAULT '{}',
             created_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )`,
        )
        .then(() => undefined);
    }
    return groupsReady;
  };

  return {
    name: 'vessels-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const { pathname } = url;
        const json = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        // --- Mutations (groups) -------------------------------------------
        if (req.method === 'POST') {
          try {
            if (pathname === '/groups') {
              await ensureGroups();
              const body = await readJsonBody(req);
              const name = String(body.name ?? '').trim();
              if (!name) {
                json(400, { error: 'Group name is required' });
                return;
              }
              const mmsis = body.mmsi ? [String(body.mmsi)] : [];
              const { rows } = await getPool().query(
                `INSERT INTO vessel_groups (name, mmsis) VALUES ($1, $2)
                 RETURNING id, name, mmsis`,
                [name, mmsis],
              );
              json(201, mapGroup(rows[0]));
              return;
            }

            const memberMatch = pathname.match(/^\/groups\/(\d+)\/members$/);
            if (memberMatch) {
              await ensureGroups();
              const body = await readJsonBody(req);
              const mmsi = String(body.mmsi ?? '');
              if (!mmsi) {
                json(400, { error: 'mmsi is required' });
                return;
              }
              const { rows } = await getPool().query(
                `UPDATE vessel_groups
                    SET mmsis = (
                      SELECT array_agg(DISTINCT m)
                        FROM unnest(array_append(mmsis, $2)) AS m
                    )
                  WHERE id = $1::int
                  RETURNING id, name, mmsis`,
                [memberMatch[1], mmsi],
              );
              if (rows.length === 0) {
                json(404, { error: 'Group not found' });
                return;
              }
              json(200, mapGroup(rows[0]));
              return;
            }

            next();
          } catch (error) {
            console.error('[vessels-api] mutation failed:', error);
            json(500, { error: 'Database write failed' });
          }
          return;
        }

        if (req.method === 'PUT') {
          try {
            const groupMatch = pathname.match(/^\/groups\/(\d+)$/);
            if (groupMatch) {
              await ensureGroups();
              const body = await readJsonBody(req);
              const mmsis = Array.isArray(body.mmsis)
                ? (body.mmsis as unknown[]).map(String)
                : [];
              const { rows } = await getPool().query(
                `UPDATE vessel_groups SET mmsis = $2 WHERE id = $1::int
                 RETURNING id, name, mmsis`,
                [groupMatch[1], mmsis],
              );
              if (rows.length === 0) {
                json(404, { error: 'Group not found' });
                return;
              }
              json(200, mapGroup(rows[0]));
              return;
            }
            next();
          } catch (error) {
            console.error('[vessels-api] update failed:', error);
            json(500, { error: 'Database write failed' });
          }
          return;
        }

        if (req.method === 'DELETE') {
          try {
            const groupMatch = pathname.match(/^\/groups\/(\d+)$/);
            if (groupMatch) {
              await ensureGroups();
              await getPool().query('DELETE FROM vessel_groups WHERE id = $1::int', [
                groupMatch[1],
              ]);
              json(200, { ok: true });
              return;
            }
            next();
          } catch (error) {
            console.error('[vessels-api] delete failed:', error);
            json(500, { error: 'Database delete failed' });
          }
          return;
        }

        if (req.method !== 'GET') {
          next();
          return;
        }

        try {
          if (pathname === '/vessels') {
            const { rows } = await getPool().query(
              `SELECT ${VESSEL_COLUMNS} FROM static_vessel_info ORDER BY vessel_name`,
            );
            json(200, rows.map(mapVessel));
            return;
          }

          if (pathname === '/satellites') {
            // The satellites table is seeded by data_scripts/satellites.sh;
            // return [] if it hasn't been created yet.
            const reg = await getPool().query("SELECT to_regclass('public.satellites') AS t");
            if (!reg.rows[0].t) {
              json(200, []);
              return;
            }
            const { rows } = await getPool().query(
              `SELECT ${SATELLITE_COLUMNS} FROM satellites ORDER BY name`,
            );
            json(200, rows.map(mapSatellite));
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
            // Optional date-range filter (?from=ISO&to=ISO).
            const conditions: string[] = [];
            const values: string[] = [];
            const from = url.searchParams.get('from');
            const to = url.searchParams.get('to');
            if (from) {
              values.push(from);
              conditions.push(`ts >= $${values.length}`);
            }
            if (to) {
              values.push(to);
              conditions.push(`ts <= $${values.length}`);
            }
            const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

            const { rows } = await getPool().query(
              `SELECT DISTINCT ON (mmsi)
                      mmsi,
                      ts,
                      ST_X(position::geometry) AS lon,
                      ST_Y(position::geometry) AS lat,
                      heading
                 FROM ais_pings
                 ${where}
                ORDER BY mmsi, ts DESC`,
              values,
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

          if (pathname === '/pings') {
            // All pings within a time range, scoped EITHER to an explicit MMSI
            // list (group filter — full, no decimation) OR to a viewport cap
            // with optional zoom-based vessel sampling. The client computes
            // latest-per-vessel and time-window filtering.
            const conditions: string[] = [];
            const values: unknown[] = [];
            const from = url.searchParams.get('from');
            const to = url.searchParams.get('to');
            if (from) {
              values.push(from);
              conditions.push(`ts >= $${values.length}`);
            }
            if (to) {
              values.push(to);
              conditions.push(`ts <= $${values.length}`);
            }

            const mmsisParam = url.searchParams.get('mmsis');
            if (mmsisParam) {
              const mmsis = mmsisParam.split(',').filter(Boolean);
              values.push(mmsis);
              conditions.push(`mmsi = ANY($${values.length}::text[])`);
            } else {
              const cap = capCondition(url, values);
              if (cap) conditions.push(cap);
              // Nested deterministic sampling: keep vessels whose stable bucket
              // (0–99) is below the zoom threshold.
              const bucket = url.searchParams.get('bucket');
              if (bucket !== null) {
                values.push(bucket);
                conditions.push(`(abs(hashtext(mmsi)) % 100) < $${values.length}::int`);
              }
            }
            const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

            const { rows } = await getPool().query(
              `SELECT mmsi, ts,
                      ST_X(position::geometry) AS lon,
                      ST_Y(position::geometry) AS lat,
                      heading
                 FROM ais_pings
                 ${where}
                ORDER BY mmsi, ts`,
              values,
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

          const trackMatch = pathname.match(/^\/pings\/track\/(\d{1,9})$/);
          if (trackMatch) {
            const conditions = ['mmsi = $1'];
            const values: string[] = [trackMatch[1]];
            const from = url.searchParams.get('from');
            const to = url.searchParams.get('to');
            if (from) {
              values.push(from);
              conditions.push(`ts >= $${values.length}`);
            }
            if (to) {
              values.push(to);
              conditions.push(`ts <= $${values.length}`);
            }
            const { rows } = await getPool().query(
              `SELECT ts,
                      ST_X(position::geometry) AS lon,
                      ST_Y(position::geometry) AS lat,
                      heading
                 FROM ais_pings
                WHERE ${conditions.join(' AND ')}
                ORDER BY ts`,
              values,
            );
            json(
              200,
              rows.map((row) => ({
                ts: row.ts,
                lon: Number(row.lon),
                lat: Number(row.lat),
                heading: num(row.heading),
              })),
            );
            return;
          }

          if (pathname === '/groups') {
            await ensureGroups();
            const { rows } = await getPool().query(
              'SELECT id, name, mmsis FROM vessel_groups ORDER BY created_at',
            );
            json(200, rows.map(mapGroup));
            return;
          }

          if (pathname === '/events/geofence') {
            // The events table is produced by analyses_scripts; return [] if it
            // hasn't been created yet.
            const reg = await getPool().query("SELECT to_regclass('public.events') AS t");
            if (!reg.rows[0].t) {
              json(200, []);
              return;
            }

            const conditions = ["event_type = 'geofence_enter_exit'"];
            const values: string[] = [];
            const from = url.searchParams.get('from');
            const to = url.searchParams.get('to');
            if (from) {
              values.push(from);
              conditions.push(`ts >= $${values.length}`);
            }
            if (to) {
              values.push(to);
              conditions.push(`ts <= $${values.length}`);
            }
            const cap = capCondition(url, values);
            if (cap) conditions.push(cap);

            const { rows } = await getPool().query(
              `SELECT mmsi, event_type, subtype, ts, details,
                      ST_X(position::geometry) AS lon,
                      ST_Y(position::geometry) AS lat
                 FROM events
                WHERE ${conditions.join(' AND ')}
                ORDER BY ts`,
              values,
            );
            json(
              200,
              rows.map((row) => ({
                mmsi: row.mmsi,
                eventType: row.event_type,
                subtype: row.subtype,
                ts: row.ts,
                lon: Number(row.lon),
                lat: Number(row.lat),
                details: row.details ?? null,
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
