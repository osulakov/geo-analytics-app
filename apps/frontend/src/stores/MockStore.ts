import { makeAutoObservable } from 'mobx';

import type { MockVessel } from '../data_loaders/mock';

/**
 * Mock Data Writer state: drawing a multi-joint device-track line on the globe.
 * Clicks add points; a double-click finishes; the points are then used to mock
 * a vessel + its AIS pings.
 */
export class MockStore {
  drawing = false;
  finished = false;
  creating = false;
  points: [number, number][] = [];
  /** The vessel just created (shown so it can be added to a group). */
  created: MockVessel | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  start(): void {
    this.drawing = true;
    this.finished = false;
    this.points = [];
    this.created = null;
  }

  addPoint(lon: number, lat: number): void {
    if (this.drawing) this.points = [...this.points, [lon, lat]];
  }

  /** Finish the line (double-click). Drops the duplicate point the double-click
   *  adds, and requires at least 2 distinct points. */
  finish(): void {
    const deduped: [number, number][] = [];
    for (const p of this.points) {
      const last = deduped[deduped.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) deduped.push(p);
    }
    if (deduped.length >= 2) {
      this.points = deduped;
      this.drawing = false;
      this.finished = true;
    } else {
      this.cancel();
    }
  }

  cancel(): void {
    this.drawing = false;
    this.finished = false;
    this.points = [];
  }

  setCreating(value: boolean): void {
    this.creating = value;
  }

  /** Record the created vessel and clear the drawn line. */
  complete(vessel: MockVessel): void {
    this.created = vessel;
    this.drawing = false;
    this.finished = false;
    this.points = [];
  }

  clearCreated(): void {
    this.created = null;
  }

  get hasTrack(): boolean {
    return this.finished && this.points.length >= 2;
  }
}
