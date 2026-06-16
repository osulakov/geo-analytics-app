import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Where images + their `<id>.json` metadata live. Override with MEDIA_DIR.
const STORAGE_DIR = path.resolve(process.env.MEDIA_DIR ?? path.join(process.cwd(), 'data'));

export interface ImageMetadata {
  id: string;
  filename: string;
  contentType: string;
  ext: string;
  /** Geospatial footprint of the image (e.g. POLYGON((...))), or null. */
  wkt: string | null;
  /** Source satellite name, or null. */
  satelliteName: string | null;
  /** Capture/acquisition timestamp supplied by the uploader, or null. */
  timestamp: string | null;
  size: number;
  createdAt: string;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/tiff': '.tif',
  'image/bmp': '.bmp',
};

const metaPath = (id: string) => path.join(STORAGE_DIR, `${id}.json`);
const imagePath = (id: string, ext: string) => path.join(STORAGE_DIR, `${id}${ext}`);

function pickExt(filename: string, contentType: string): string {
  const fromName = path.extname(filename || '').toLowerCase();
  if (fromName) return fromName;
  return EXT_BY_TYPE[contentType] ?? '.bin';
}

export function ensureStorage(): void {
  if (!existsSync(STORAGE_DIR)) mkdirSync(STORAGE_DIR, { recursive: true });
}

export async function saveImage(
  buffer: Buffer,
  filename: string,
  contentType: string,
  fields: { wkt: string | null; satelliteName: string | null; timestamp: string | null },
): Promise<ImageMetadata> {
  const id = randomUUID();
  const ext = pickExt(filename, contentType);
  const meta: ImageMetadata = {
    id,
    filename: filename || `${id}${ext}`,
    contentType: contentType || 'application/octet-stream',
    ext,
    wkt: fields.wkt,
    satelliteName: fields.satelliteName,
    timestamp: fields.timestamp,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(imagePath(id, ext), buffer);
  await fs.writeFile(metaPath(id), JSON.stringify(meta, null, 2));
  return meta;
}

export async function listImages(): Promise<ImageMetadata[]> {
  const files = await fs.readdir(STORAGE_DIR).catch(() => [] as string[]);
  const metas: ImageMetadata[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      metas.push(JSON.parse(await fs.readFile(path.join(STORAGE_DIR, f), 'utf8')) as ImageMetadata);
    } catch {
      // Skip unreadable/corrupt metadata.
    }
  }
  metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return metas;
}

export async function getImageMeta(id: string): Promise<ImageMetadata | null> {
  try {
    return JSON.parse(await fs.readFile(metaPath(id), 'utf8')) as ImageMetadata;
  } catch {
    return null;
  }
}

export function imageFilePath(meta: ImageMetadata): string {
  return imagePath(meta.id, meta.ext);
}

export async function deleteImage(id: string): Promise<boolean> {
  const meta = await getImageMeta(id);
  if (!meta) return false;
  await fs.rm(imagePath(id, meta.ext), { force: true });
  await fs.rm(metaPath(id), { force: true });
  return true;
}
