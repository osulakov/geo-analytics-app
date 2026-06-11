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

/** Holds the latest ping per vessel (within a date range) for the globe. */
export class PingStore {
  pings: LatestPing[] = [];
  loaded = false;

  // Global date range. Defaults to roughly the seeded two-week window.
  fromDate: string;
  toDate: string;

  // Full track of one vessel, shown on demand from the vessel modal.
  trackMmsi: string | null = null;
  track: TrackPoint[] = [];

  // Vessel whose latest ping pulses (selected from the Vessels list).
  highlightMmsi: string | null = null;

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

  /** Load and show the full path for a vessel. */
  async showTrack(mmsi: string): Promise<void> {
    this.trackMmsi = mmsi;
    this.track = [];
    try {
      const track = await fetchVesselTrack(mmsi);
      runInAction(() => {
        if (this.trackMmsi === mmsi) this.track = track;
      });
    } catch (error) {
      console.error(`Failed to load track for ${mmsi}:`, error);
    }
  }

  clearTrack(): void {
    this.trackMmsi = null;
    this.track = [];
  }

  setHighlight(mmsi: string | null): void {
    this.highlightMmsi = mmsi;
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
