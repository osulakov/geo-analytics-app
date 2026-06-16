import express from 'express';
import cors from 'cors';
import multer from 'multer';

import {
  deleteImage,
  ensureStorage,
  getImageMeta,
  imageFilePath,
  listImages,
  saveImage,
} from './storage';

const PORT = Number(process.env.PORT ?? 4100);

const app = express();
app.use(cors());

// Keep uploads in memory (≤25 MB), then write to disk in saveImage.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Ids are UUIDs — validate before touching the filesystem (no path traversal).
const isId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// List all images (metadata only).
app.get('/images', async (_req, res) => {
  res.json(await listImages());
});

// Save an image. multipart/form-data: file field `image`, text field `wkt`.
app.post('/images', upload.single('image'), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'An image file is required (form field "image")' });
    return;
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const wkt = str(req.body?.wkt);
  const satelliteName = str(req.body?.satelliteName);
  const timestamp = str(req.body?.timestamp);
  try {
    const meta = await saveImage(file.buffer, file.originalname, file.mimetype, { wkt, satelliteName, timestamp });
    res.status(201).json(meta);
  } catch (error) {
    console.error('[media-bucket] save failed:', error);
    res.status(500).json({ error: 'Failed to save image' });
  }
});

// Read one image's metadata.
app.get('/images/:id/metadata', async (req, res) => {
  if (!isId(req.params.id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const meta = await getImageMeta(req.params.id);
  if (!meta) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(meta);
});

// Read (serve) the image bytes.
app.get('/images/:id', async (req, res) => {
  if (!isId(req.params.id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const meta = await getImageMeta(req.params.id);
  if (!meta) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.type(meta.contentType);
  res.sendFile(imageFilePath(meta), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Image file missing' });
  });
});

// Delete an image + its metadata.
app.delete('/images/:id', async (req, res) => {
  if (!isId(req.params.id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const ok = await deleteImage(req.params.id);
  res.status(ok ? 204 : 404).end();
});

ensureStorage();
app.listen(PORT, () => {
  console.log(`[media-bucket] listening on http://localhost:${PORT}`);
});
