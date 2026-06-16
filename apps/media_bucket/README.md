# media_bucket

Image storage microservice. Stores images on disk under `data/` (override with
`MEDIA_DIR`), each with a sidecar `<id>.json` metadata file (filename, content
type, size, createdAt, and the image's `wkt` footprint).

## Run

```bash
npm install
npm run dev          # or: npm start   (PORT defaults to 4100)
```

## API

| Method | Path                   | Description                                                  |
| ------ | ---------------------- | ------------------------------------------------------------ |
| GET    | `/health`              | Liveness check.                                              |
| GET    | `/images`             | List all images' metadata (newest first).                   |
| POST   | `/images`             | Save an image. `multipart/form-data`: file `image`, text `wkt`. |
| GET    | `/images/:id`         | Read (serve) the image bytes.                                |
| GET    | `/images/:id/metadata`| Read one image's metadata JSON.                              |
| DELETE | `/images/:id`         | Delete the image + its metadata.                             |

### Examples

```bash
# Save (returns the metadata incl. id)
curl -F image=@photo.png -F 'wkt=POLYGON((0 0,1 0,1 1,0 1,0 0))' http://localhost:4100/images

# List
curl http://localhost:4100/images

# Read image / metadata
curl http://localhost:4100/images/<id> --output out.png
curl http://localhost:4100/images/<id>/metadata

# Delete
curl -X DELETE http://localhost:4100/images/<id>
```
