import { makeAutoObservable, observable, runInAction } from 'mobx';

import { imageUrl, listImages, type UploadedImage } from '../data_loaders/media';

export interface ImageryItem {
  meta: UploadedImage;
  /** Footprint polygon ring as [lon, lat] pairs (parsed from WKT), or null. */
  polygon: [number, number][] | null;
  /** Footprint centroid [lon, lat], or null when there's no polygon. */
  center: [number, number] | null;
  /** Lazily-loaded raster, drawn over the footprint by the map. */
  image: HTMLImageElement | null;
}

/** Parse the outer ring of a `POLYGON((lon lat, ...))` WKT string. Returns null
 *  for anything that isn't a polygon (e.g. a bare POINT) or fails to parse. */
function parsePolygon(wkt: string | null): [number, number][] | null {
  if (!wkt) return null;
  const match = /POLYGON\s*\(\s*\((.+?)\)\s*\)/i.exec(wkt);
  if (!match) return null;
  const ring = match[1]
    .split(',')
    .map((pair) => {
      const [lon, lat] = pair.trim().split(/\s+/).map(Number);
      return [lon, lat] as [number, number];
    })
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  return ring.length >= 3 ? ring : null;
}

/** Mean-vertex centroid of a ring (good enough for placing a marker). */
function centroidOf(ring: [number, number][]): [number, number] {
  let lon = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lon += x;
    lat += y;
  }
  return [lon / ring.length, lat / ring.length];
}

/** Stored imagery, with footprints parsed and rasters loaded for the map. */
export class ImageryStore {
  items: ImageryItem[] = [];

  constructor() {
    makeAutoObservable(this, { items: observable.ref });
  }

  /** Load the imagery list, parse footprints, and kick off raster loading. */
  async load(): Promise<void> {
    try {
      const metas = await listImages();
      const items: ImageryItem[] = metas.map((meta) => {
        const polygon = parsePolygon(meta.wkt);
        return {
          meta,
          polygon,
          center: polygon ? centroidOf(polygon) : null,
          image: null,
        };
      });
      runInAction(() => {
        this.items = items;
      });
      // Load rasters in the background; the render loop picks them up per frame.
      for (const item of items) {
        const img = new Image();
        img.src = imageUrl(item.meta.id);
        item.image = img;
      }
    } catch (error) {
      console.error('Failed to load imagery:', error);
    }
  }
}
