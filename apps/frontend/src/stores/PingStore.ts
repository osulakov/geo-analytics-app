import { makeAutoObservable, runInAction } from 'mobx';

import {
  fetchLatestPings,
  fetchVesselTrack,
  type LatestPing,
  type TrackPoint,
} from '../api/pings';

/** Format a Date as a local `YYYY-MM-DD` string for <input type="date">. */
function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface VesselTrack {
  mmsi: string;
  points: TrackPoint[];
}

/** Holds the latest ping per vessel (within a date range) for the globe. */
export class PingStore {
  pings: LatestPing[] = [];
  loaded = false;

  // Global date range. Defaults to roughly the seeded two-week window.
  fromDate: string;
  toDate: string;

  // Loaded vessel tracks (one from the modal, or many from a group).
  tracks: VesselTrack[] = [];
  private trackToken = 0;

  // Vessels whose latest ping pulses (single selection or a whole group).
  highlightMmsis: string[] = [];

  // Group currently shown on the map (its eye toggle is "on"), if any.
  shownGroupId: number | null = null;

  constructor() {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 14);
    this.toDate = toDateInput(today);
    this.fromDate = toDateInput(from);

    makeAutoObservable(this);
  }

  /** Update the range and reload the map for it. */
  applyRange(fromDate: string, toDate: string): void {
    this.fromDate = fromDate;
    this.toDate = toDate;
    void this.load();
  }

  /** Load and show the full path for a single vessel (within the date range). */
  async showTrack(mmsi: string): Promise<void> {
    this.shownGroupId = null;
    await this.showTracks([mmsi]);
  }

  /** Show a whole group: glow every member and load all their tracks. */
  async showGroup(groupId: number, mmsis: string[]): Promise<void> {
    this.shownGroupId = groupId;
    this.highlightMmsis = mmsis;
    await this.showTracks(mmsis);
  }

  /** Hide the shown group (clears its glow and tracks). */
  hideGroup(): void {
    this.highlightMmsis = [];
    this.clearTracks();
  }

  /** Load and show the full paths for several vessels (within the date range). */
  async showTracks(mmsis: string[]): Promise<void> {
    const token = ++this.trackToken;
    this.tracks = [];
    try {
      const results = await Promise.all(
        mmsis.map(async (mmsi) => ({
          mmsi,
          points: await fetchVesselTrack(mmsi, this.fromDate, this.toDate),
        })),
      );
      runInAction(() => {
        if (this.trackToken === token) this.tracks = results;
      });
    } catch (error) {
      console.error('Failed to load tracks:', error);
    }
  }

  clearTracks(): void {
    this.trackToken++;
    this.tracks = [];
    this.shownGroupId = null;
  }

  setHighlight(mmsi: string | null): void {
    this.highlightMmsis = mmsi ? [mmsi] : [];
    this.shownGroupId = null;
  }

  setHighlightMany(mmsis: string[]): void {
    this.highlightMmsis = mmsis;
  }

  clearHighlight(): void {
    this.highlightMmsis = [];
  }

  async load(): Promise<void> {
    try {
      const pings = await fetchLatestPings(this.fromDate, this.toDate);
      runInAction(() => {
        this.pings = pings;
        this.loaded = true;
      });
    } catch (error) {
      console.error('Failed to load latest pings:', error);
    }
  }
}
