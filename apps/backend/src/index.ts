import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';

import { ensureSchema, pool } from './db';
import { requireAuth, signToken, type TokenPayload } from './auth';
import { runObjectDetection, type Detection } from './objectDetection';

// Load .env (OPENAI_API_KEY, etc.) from the backend dir when present.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the ambient environment.
}

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
// Allow large bodies: image-analysis requests carry base64-encoded images.
app.use(express.json({ limit: '25mb' }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(body: unknown): { email: string; password: string } | string {
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return 'A valid email is required';
  }
  if (typeof password !== 'string' || password.length < 6) {
    return 'Password must be at least 6 characters';
  }
  return { email: email.trim().toLowerCase(), password };
}

app.get('/auth/health', (_req, res) => {
  res.json({ ok: true });
});

// Create an account, then return a JWT so the user is immediately logged in.
app.post('/auth/signup', async (req, res) => {
  const parsed = validateCredentials(req.body);
  if (typeof parsed === 'string') {
    res.status(400).json({ error: parsed });
    return;
  }
  const { email, password } = parsed;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query<{ id: number; email: string }>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
      [email, passwordHash],
    );
    const user = rows[0];
    const token = signToken({ sub: user.id, email: user.email });
    res.status(201).json({ token, email: user.email });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'An account with that email already exists' });
      return;
    }
    console.error('[auth] signup failed:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Verify credentials and issue a JWT.
app.post('/auth/login', async (req, res) => {
  const parsed = validateCredentials(req.body);
  if (typeof parsed === 'string') {
    res.status(400).json({ error: parsed });
    return;
  }
  const { email, password } = parsed;
  try {
    const { rows } = await pool.query<{ id: number; email: string; password_hash: string }>(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [email],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, email: user.email });
  } catch (error) {
    console.error('[auth] login failed:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Return the current user from a valid token (used to restore a session).
app.get('/auth/me', requireAuth, (req, res) => {
  const user = (req as express.Request & { user?: TokenPayload }).user;
  res.json({ email: user?.email });
});

// --- Areas of interest (per-user) ------------------------------------------

function currentUserId(req: express.Request): number {
  return Number((req as express.Request & { user?: TokenPayload }).user?.sub);
}

interface AoiRow {
  id: string;
  name: string;
  coordinates: [number, number][];
  area_km2: number;
}

function mapAoi(row: AoiRow) {
  return {
    id: String(row.id),
    name: row.name,
    coordinates: row.coordinates,
    areaKm2: Number(row.area_km2),
  };
}

function isValidRing(value: unknown): value is [number, number][] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.every(
      (p) =>
        Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number',
    )
  );
}

// List the signed-in user's AOIs.
app.get('/aois', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query<AoiRow>(
      `SELECT id, name, coordinates, area_km2 FROM aois WHERE user_id = $1 ORDER BY created_at`,
      [currentUserId(req)],
    );
    res.json(rows.map(mapAoi));
  } catch (error) {
    console.error('[aois] list failed:', error);
    res.status(500).json({ error: 'Failed to load AOIs' });
  }
});

// Create an AOI owned by the signed-in user.
app.post('/aois', requireAuth, async (req, res) => {
  const { name, coordinates, areaKm2 } = (req.body ?? {}) as {
    name?: unknown;
    coordinates?: unknown;
    areaKm2?: unknown;
  };
  if (!isValidRing(coordinates)) {
    res.status(400).json({ error: 'coordinates must be an array of at least 3 [lon, lat] pairs' });
    return;
  }
  try {
    const { rows } = await pool.query<AoiRow>(
      `INSERT INTO aois (user_id, name, coordinates, area_km2)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, coordinates, area_km2`,
      [
        currentUserId(req),
        String(name ?? 'AOI').trim() || 'AOI',
        JSON.stringify(coordinates),
        Number(areaKm2) || 0,
      ],
    );
    res.status(201).json(mapAoi(rows[0]));
  } catch (error) {
    console.error('[aois] create failed:', error);
    res.status(500).json({ error: 'Failed to create AOI' });
  }
});

// Rename an AOI (only if it belongs to the signed-in user).
app.put('/aois/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid AOI id' });
    return;
  }
  const name = String((req.body ?? {}).name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const { rows } = await pool.query<AoiRow>(
      `UPDATE aois SET name = $1
        WHERE id = $2::bigint AND user_id = $3
        RETURNING id, name, coordinates, area_km2`,
      [name, req.params.id, currentUserId(req)],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'AOI not found' });
      return;
    }
    res.json(mapAoi(rows[0]));
  } catch (error) {
    console.error('[aois] rename failed:', error);
    res.status(500).json({ error: 'Failed to rename AOI' });
  }
});

// Delete an AOI (only if it belongs to the signed-in user).
app.delete('/aois/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid AOI id' });
    return;
  }
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM aois WHERE id = $1::bigint AND user_id = $2`,
      [req.params.id, currentUserId(req)],
    );
    res.status(rowCount ? 204 : 404).end();
  } catch (error) {
    console.error('[aois] delete failed:', error);
    res.status(500).json({ error: 'Failed to delete AOI' });
  }
});

// --- Jobs (per-user) -------------------------------------------------------

interface JobRow {
  id: string;
  name: string;
  analysis_config_id: string;
  analysis_config: unknown;
  aoi_wkt: string | null;
  from_ts: string | null;
  to_ts: string | null;
  event_count: number;
  created_at: string;
}

function mapJob(row: JobRow) {
  return {
    id: String(row.id),
    name: row.name,
    analysisConfigId: row.analysis_config_id,
    analysisConfig: row.analysis_config ?? null,
    aoiWkt: row.aoi_wkt,
    fromIso: row.from_ts,
    toIso: row.to_ts,
    eventCount: Number(row.event_count),
    createdAt: row.created_at,
  };
}

const JOB_COLUMNS =
  'id, name, analysis_config_id, analysis_config, aoi_wkt, from_ts, to_ts, event_count, created_at';

// List the signed-in user's jobs.
app.get('/jobs', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query<JobRow>(
      `SELECT ${JOB_COLUMNS} FROM jobs WHERE user_id = $1 ORDER BY created_at DESC`,
      [currentUserId(req)],
    );
    res.json(rows.map(mapJob));
  } catch (error) {
    console.error('[jobs] list failed:', error);
    res.status(500).json({ error: 'Failed to load jobs' });
  }
});

// Create a job. Only the job metadata is stored (its result events are not
// persisted); event_count records how many the run produced.
app.post('/jobs', requireAuth, async (req, res) => {
  const { name, analysisConfigId, analysisConfig, aoiWkt, fromIso, toIso, eventCount } =
    (req.body ?? {}) as {
      name?: unknown;
      analysisConfigId?: unknown;
      analysisConfig?: unknown;
      aoiWkt?: unknown;
      fromIso?: unknown;
      toIso?: unknown;
      eventCount?: unknown;
    };
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Job name is required' });
    return;
  }
  try {
    const { rows } = await pool.query<JobRow>(
      `INSERT INTO jobs (user_id, name, analysis_config_id, analysis_config, aoi_wkt, from_ts, to_ts, event_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${JOB_COLUMNS}`,
      [
        currentUserId(req),
        name.trim(),
        String(analysisConfigId ?? ''),
        analysisConfig == null ? null : JSON.stringify(analysisConfig),
        (aoiWkt as string | null) ?? null,
        (fromIso as string | null) ?? null,
        (toIso as string | null) ?? null,
        Number(eventCount) || 0,
      ],
    );
    res.status(201).json(mapJob(rows[0]));
  } catch (error) {
    console.error('[jobs] create failed:', error);
    res.status(500).json({ error: 'Failed to save job' });
  }
});

// Delete a job (only the signed-in user's). Related rows cascade automatically:
// detected_objects.job_id and events.job_id are ON DELETE CASCADE.
app.delete('/jobs/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid job id' });
    return;
  }
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM jobs WHERE id = $1::bigint AND user_id = $2`,
      [req.params.id, currentUserId(req)],
    );
    res.status(rowCount ? 204 : 404).end();
  } catch (error) {
    console.error('[jobs] delete failed:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// --- Object detection (imagery → OpenAI → detected_objects) ----------------

interface DetectedObjectRow {
  id: string;
  job_id: string;
  image_id: string | null;
  geojson: unknown;
  metadata: unknown;
  ts: string | null;
}

function mapDetection(row: DetectedObjectRow) {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    imageId: row.image_id,
    geojson: row.geojson,
    metadata: row.metadata ?? null,
    ts: row.ts,
  };
}

// Load a job owned by the signed-in user, or null.
async function loadOwnedJob(jobId: string, userId: number): Promise<JobRow | null> {
  const { rows } = await pool.query<JobRow>(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE id = $1::bigint AND user_id = $2`,
    [jobId, userId],
  );
  return rows[0] ?? null;
}

// Read the persisted detections for a job (used when invoking a finished job).
app.get('/jobs/:id/object-detection', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid job id' });
    return;
  }
  try {
    const job = await loadOwnedJob(req.params.id, currentUserId(req));
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    const { rows } = await pool.query<DetectedObjectRow>(
      `SELECT id, job_id, image_id, geojson, metadata, ts
         FROM detected_objects WHERE job_id = $1::bigint ORDER BY ts NULLS LAST, id`,
      [req.params.id],
    );
    res.json(rows.map(mapDetection));
  } catch (error) {
    console.error('[object-detection] load failed:', error);
    res.status(500).json({ error: 'Failed to load detections' });
  }
});

// Run object detection for a job: detect objects in the in-scope imagery and
// (re)persist them under the job, replacing any previous detections.
app.post('/jobs/:id/object-detection', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid job id' });
    return;
  }
  try {
    const job = await loadOwnedJob(req.params.id, currentUserId(req));
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    let detections: Detection[];
    try {
      detections = await runObjectDetection(pool, {
        aoiWkt: job.aoi_wkt,
        fromIso: job.from_ts,
        toIso: job.to_ts,
      });
    } catch (error) {
      console.error('[object-detection] run failed:', error);
      res.status(502).json({ error: (error as Error).message || 'Object detection failed' });
      return;
    }

    // Replace this job's detections atomically, then update its event count.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM detected_objects WHERE job_id = $1::bigint`, [req.params.id]);
      for (const d of detections) {
        await client.query(
          `INSERT INTO detected_objects (job_id, image_id, geojson, metadata, ts)
           VALUES ($1::bigint, $2, $3, $4, $5)`,
          [req.params.id, d.imageId, JSON.stringify(d.geojson), JSON.stringify(d.metadata), d.ts],
        );
      }
      await client.query(`UPDATE jobs SET event_count = $1 WHERE id = $2::bigint`, [
        detections.length,
        req.params.id,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const { rows } = await pool.query<DetectedObjectRow>(
      `SELECT id, job_id, image_id, geojson, metadata, ts
         FROM detected_objects WHERE job_id = $1::bigint ORDER BY ts NULLS LAST, id`,
      [req.params.id],
    );
    res.json(rows.map(mapDetection));
  } catch (error) {
    console.error('[object-detection] persist failed:', error);
    res.status(500).json({ error: 'Failed to run object detection' });
  }
});

// --- Image analysis (OpenAI vision) ----------------------------------------

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

/** Normalise the UI-supplied image into a value OpenAI accepts as image_url:
 *  a data URL, an http(s) URL, or raw base64 (wrapped with the given mime). */
function toImageUrl(image: string, mimeType: string): string {
  if (/^data:|^https?:\/\//i.test(image)) return image;
  return `data:${mimeType};base64,${image}`;
}

// Send an image + prompt to OpenAI's vision model and return the text reply.
app.post('/openai/analyze-image', async (req, res) => {
  const { prompt, image, mimeType } = (req.body ?? {}) as {
    prompt?: unknown;
    image?: unknown;
    mimeType?: unknown;
  };
  if (typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  if (typeof image !== 'string' || !image.trim()) {
    res.status(400).json({ error: 'image is required (data URL, http(s) URL, or base64)' });
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[openai] OPENAI_API_KEY is not set');
    res.status(500).json({ error: 'OpenAI is not configured' });
    return;
  }

  const imageUrl = toImageUrl(image.trim(), typeof mimeType === 'string' ? mimeType : 'image/jpeg');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt.trim() },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: unknown;
      error?: { message?: string };
    };

    if (!response.ok) {
      console.error('[openai] request failed:', data?.error ?? response.statusText);
      res.status(response.status).json({ error: data?.error?.message ?? 'OpenAI request failed' });
      return;
    }

    res.json({
      result: data.choices?.[0]?.message?.content ?? '',
      model: OPENAI_MODEL,
      usage: data.usage ?? null,
    });
  } catch (error) {
    console.error('[openai] analyze-image failed:', error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[backend] auth API listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('[backend] failed to initialise database schema:', error);
    process.exit(1);
  });
