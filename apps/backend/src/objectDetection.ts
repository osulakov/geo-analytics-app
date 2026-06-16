import type pg from 'pg';

// Media bucket microservice (stores imagery + WKT/timestamp metadata on disk).
const MEDIA_URL = process.env.MEDIA_URL ?? 'http://localhost:4100';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

export interface ImageMeta {
  id: string;
  filename: string;
  contentType: string;
  wkt: string | null;
  satelliteName: string | null;
  timestamp: string | null;
  createdAt: string;
}

/** One detected object ready to persist: a GeoJSON Polygon + metadata + time. */
export interface Detection {
  imageId: string;
  geojson: { type: 'Polygon'; coordinates: number[][][] };
  metadata: Record<string, unknown>;
  ts: string | null;
}

/** A job's run parameters (read from the jobs row). */
export interface DetectionJob {
  aoiWkt: string | null;
  fromIso: string | null;
  toIso: string | null;
}

/** Axis-aligned geographic bounds [minLon, minLat, maxLon, maxLat] of a WKT
 *  polygon. Used to map normalized image coords into lon/lat. */
function bboxFromWkt(wkt: string): [number, number, number, number] | null {
  const match = /\(\s*\(([^)]+)\)/.exec(wkt);
  if (!match) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const pair of match[1].split(',')) {
    const [lon, lat] = pair.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return Number.isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : null;
}

/** Fetch the imagery catalogue (metadata only) from the media bucket. */
async function fetchImageList(): Promise<ImageMeta[]> {
  const res = await fetch(`${MEDIA_URL}/images`);
  if (!res.ok) throw new Error(`media bucket list failed: ${res.status}`);
  return (await res.json()) as ImageMeta[];
}

/** Fetch one image's bytes and return a base64 data URL for OpenAI. */
async function fetchImageDataUrl(meta: ImageMeta): Promise<string> {
  const res = await fetch(`${MEDIA_URL}/images/${meta.id}`);
  if (!res.ok) throw new Error(`media bucket image ${meta.id} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = meta.contentType || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** Select imagery within the date range whose footprint intersects the AOI
 *  (or all dated imagery when there's no AOI). Intersection uses PostGIS. */
async function imagesInScope(
  pool: pg.Pool,
  job: DetectionJob,
): Promise<ImageMeta[]> {
  const all = await fetchImageList();
  const from = job.fromIso ? Date.parse(job.fromIso) : null;
  const to = job.toIso ? Date.parse(job.toIso) : null;

  const inRange = all.filter((m) => {
    if (!m.wkt) return false; // no footprint → can't place detections
    const t = Date.parse(m.timestamp ?? m.createdAt);
    if (Number.isNaN(t)) return true;
    if (from !== null && t < from) return false;
    if (to !== null && t > to) return false;
    return true;
  });

  if (!job.aoiWkt) return inRange;

  const hits: ImageMeta[] = [];
  for (const m of inRange) {
    try {
      const { rows } = await pool.query<{ hit: boolean }>(
        `SELECT ST_Intersects(
                  ST_GeomFromText($1, 4326),
                  ST_GeomFromText($2, 4326)
                ) AS hit`,
        [job.aoiWkt, m.wkt],
      );
      if (rows[0]?.hit) hits.push(m);
    } catch (error) {
      console.error(`[object-detection] intersect test failed for ${m.id}:`, error);
    }
  }
  return hits;
}

interface RawObject {
  label?: string;
  objectClass?: string | null;
  confidence?: number;
  polygon?: [number, number][];
}

/** Ask OpenAI to detect objects in one image and return raw normalized polys. */
async function detectInImage(meta: ImageMeta, dataUrl: string): Promise<RawObject[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const bbox = meta.wkt ? bboxFromWkt(meta.wkt) : null;
  const prompt =
    `You are analyzing a satellite/aerial image.\n` +
    `Metadata:\n` +
    `- Satellite: ${meta.satelliteName ?? 'unknown'}\n` +
    `- Capture time (UTC): ${meta.timestamp ?? meta.createdAt}\n` +
    `- Geographic footprint (lon/lat bbox): ${bbox ? bbox.join(', ') : 'unknown'}\n\n` +
    `Detect distinct physical objects of these kinds: ships, airplanes, ` +
    `helicopters, cars, trucks. Use a lowercase "label" naming the kind (e.g. ` +
    `"ship", "airplane", "helicopter", "car", "truck").\n` +
    `For ships and airplanes, also classify the specific type into "objectClass" ` +
    `when discernible — e.g. ships: cargo, tanker, container, fishing, naval, tug, ` +
    `passenger; airplanes: airliner, fighter jet, cargo plane, private. For other ` +
    `kinds (helicopters, cars, trucks) set "objectClass" to null.\n` +
    `Make each polygon tightly outline the actual object: trace its outline (e.g. a ` +
    `ship's hull, an aircraft's fuselage + wings) so the polygon fits as closely as ` +
    `possible — not a loose box.\n` +
    `Return STRICT JSON of the form {"objects":[{"label":string,"objectClass":string|null,` +
    `"confidence":number,"polygon":[[x,y],...]}]}. Coordinates are NORMALIZED to the ` +
    `image: x and y in [0,1], origin at the TOP-LEFT, x rightward, y downward. Each ` +
    `polygon needs at least 3 points outlining the object. If none are found, return ` +
    `{"objects":[]}.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI failed: ${res.status}`);

  const content = data.choices?.[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(content) as { objects?: RawObject[] };
    return Array.isArray(parsed.objects) ? parsed.objects : [];
  } catch {
    console.error('[object-detection] could not parse OpenAI JSON:', content.slice(0, 200));
    return [];
  }
}

/** Map a normalized [x,y] (top-left origin) polygon into a lon/lat ring using
 *  the image footprint bbox, returning a closed GeoJSON Polygon. */
function toGeoPolygon(
  polygon: [number, number][],
  bbox: [number, number, number, number],
): { type: 'Polygon'; coordinates: number[][][] } | null {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const ring = polygon
    .filter((p) => Array.isArray(p) && p.length === 2)
    .map(([x, y]) => [
      minLon + Math.min(1, Math.max(0, x)) * (maxLon - minLon),
      maxLat - Math.min(1, Math.max(0, y)) * (maxLat - minLat),
    ]);
  if (ring.length < 3) return null;
  // Close the ring.
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Run object detection for a job: find in-scope imagery, detect objects in
 *  each (one OpenAI call per image), and return geo-located detections. */
export async function runObjectDetection(pool: pg.Pool, job: DetectionJob): Promise<Detection[]> {
  const images = await imagesInScope(pool, job);
  const detections: Detection[] = [];

  for (const meta of images) {
    const bbox = meta.wkt ? bboxFromWkt(meta.wkt) : null;
    if (!bbox) continue;
    let dataUrl: string;
    try {
      dataUrl = await fetchImageDataUrl(meta);
    } catch (error) {
      console.error(`[object-detection] fetch image ${meta.id} failed:`, error);
      continue;
    }
    const objects = await detectInImage(meta, dataUrl);
    const ts = meta.timestamp ?? meta.createdAt;
    for (const obj of objects) {
      const geojson = toGeoPolygon(obj.polygon ?? [], bbox);
      if (!geojson) continue;
      detections.push({
        imageId: meta.id,
        geojson,
        metadata: {
          label: obj.label ?? 'object',
          object_class: obj.objectClass ?? null,
          confidence: typeof obj.confidence === 'number' ? obj.confidence : null,
          satelliteName: meta.satelliteName,
          imageId: meta.id,
          filename: meta.filename,
        },
        ts,
      });
    }
  }

  return detections;
}
