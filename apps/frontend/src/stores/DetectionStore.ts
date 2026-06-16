import { makeAutoObservable, observable, runInAction } from 'mobx';

import {
  loadObjectDetections,
  runObjectDetection,
  type DetectedObject,
} from '../data_loaders/detections';
import type { AuthStore } from './AuthStore';

export interface DetectionItem {
  detection: DetectedObject;
  /** Outer ring as [lon, lat] pairs (parsed from the geojson), or null. */
  ring: [number, number][] | null;
  /** Ring centroid [lon, lat] for far-side culling / hover, or null. */
  center: [number, number] | null;
  /** Capture timestamp parsed to ms (NaN when absent/unparseable). */
  tMs: number;
}

function ringOf(d: DetectedObject): [number, number][] | null {
  const coords = d.geojson?.coordinates?.[0];
  if (!Array.isArray(coords) || coords.length < 3) return null;
  return coords
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .map(([lon, lat]) => [lon, lat] as [number, number]);
}

function centroidOf(ring: [number, number][]): [number, number] {
  let lon = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lon += x;
    lat += y;
  }
  return [lon / ring.length, lat / ring.length];
}

/** Object-detection results for the currently applied job(s). */
export class DetectionStore {
  items: DetectionItem[] = [];
  running = false;

  constructor(private auth: AuthStore) {
    makeAutoObservable(this, { auth: false, items: observable.ref } as never);
  }

  private setItems(detections: DetectedObject[]): void {
    this.items = detections.map((detection) => {
      const ring = ringOf(detection);
      return {
        detection,
        ring,
        center: ring ? centroidOf(ring) : null,
        tMs: detection.ts ? Date.parse(detection.ts) : NaN,
      };
    });
  }

  /** Run detection on the backend (OpenAI) and store the results. */
  async run(jobId: string): Promise<void> {
    if (!this.auth.token) return;
    this.running = true;
    try {
      const detections = await runObjectDetection(jobId, this.auth.token);
      runInAction(() => this.setItems(detections));
    } catch (error) {
      console.error('Object detection run failed:', error);
    } finally {
      runInAction(() => {
        this.running = false;
      });
    }
  }

  /** Load persisted detections for a job (no re-run). */
  async load(jobId: string): Promise<void> {
    await this.loadMany([jobId]);
  }

  /** Load + combine persisted detections for several jobs (no re-run). */
  async loadMany(jobIds: string[]): Promise<void> {
    if (!this.auth.token || jobIds.length === 0) {
      runInAction(() => this.clear());
      return;
    }
    const token = this.auth.token;
    try {
      const lists = await Promise.all(jobIds.map((id) => loadObjectDetections(id, token)));
      runInAction(() => this.setItems(lists.flat()));
    } catch (error) {
      console.error('Loading detections failed:', error);
    }
  }

  clear(): void {
    this.items = [];
  }
}
