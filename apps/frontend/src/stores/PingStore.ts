import { makeAutoObservable, observable, runInAction } from 'mobx';

import {
  fetchAllPings,
  fetchVesselTrack,
  type LatestPing,
  type TrackPoint,
  type ViewportCap,
} from '../data_loaders/pings';

/** A ping with its timestamp pre-parsed to ms (avoids per-filter Date.parse). */
interface TimedPing extends LatestPing {
  tMs: number;
}

/** Format a Date as a local `YYYY-MM-DD` string for <input type="date">. */
function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const dayStartIso = (day: string) => `${day}T00:00:00Z`;
const dayEndIso = (day: string) => `${day}T23:59:59Z`;

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

export interface VesselTrack {
  mmsi: string;
  points: TrackPoint[];
}

/**
 * Holds ALL pings for the current viewport + global date range. The map only
 * re-queries the DB on load / range change / viewport change (pan, zoom); the
 * time-range slider just narrows `windowStart`/`windowEnd`, and the displayed
 * pings are derived client-side (latest-per-vessel within the window).
 */
export class PingStore {
  // Raw pings for the viewport + global range (ts pre-parsed to ms).
  allPings: TimedPing[] = [];
  // Displayed pings: latest-per-vessel within the active window. Recomputed
  // only on load / window change (a plain field, not a per-frame computed).
  pings: LatestPing[] = [];
  loaded = false;

  // Global date range (slider bounds). Defaults to the seeded two-week window.
  fromDate: string;
  toDate: string;

  // Active time window (ISO), driven by the time-range slider (client-side).
  windowStart: string;
  windowEnd: string;

  // Current viewport spherical cap; data is loaded only for this area.
  viewport: ViewportCap | null = null;

  // Loaded vessel tracks (one from the modal, or many from a group).
  tracks: VesselTrack[] = [];

  // In-flight request controllers, so a newer request supersedes an older one.
  loadController: AbortController | null = null;
  tracksController: AbortController | null = null;

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
    this.windowStart = dayStartIso(this.fromDate);
    this.windowEnd = dayEndIso(this.toDate);

    makeAutoObservable(this, {
      loadController: false,
      tracksController: false,
      allPings: observable.ref,
      pings: observable.ref,
    });
  }

  get rangeStartIso(): string {
    return dayStartIso(this.fromDate);
  }

  get rangeEndIso(): string {
    return dayEndIso(this.toDate);
  }

  /** Recompute displayed pings: latest-per-vessel within the active window. */
  private recompute(): void {
    const start = Date.parse(this.windowStart);
    const end = Date.parse(this.windowEnd);
    const latest = new Map<string, LatestPing>();
    // allPings is ordered by (mmsi, ts asc), so the last in-window wins.
    for (const ping of this.allPings) {
      if (ping.tMs < start || ping.tMs > end) continue;
      latest.set(ping.mmsi, ping);
    }
    this.pings = Array.from(latest.values());
  }

  /** Set the viewport (pan/zoom) and reload pings for it. */
  setViewport(cap: ViewportCap): void {
    this.viewport = cap;
    void this.load();
  }

  /** Update the global range, reset the active window to it, and reload. */
  applyRange(fromDate: string, toDate: string): void {
    this.fromDate = fromDate;
    this.toDate = toDate;
    this.windowStart = dayStartIso(fromDate);
    this.windowEnd = dayEndIso(toDate);
    void this.load();
    this.reloadTracks();
  }

  /** Narrow/widen the active time window (slider) — client-side only, no fetch. */
  setWindow(startIso: string, endIso: string): void {
    this.windowStart = startIso;
    this.windowEnd = endIso;
    this.recompute();
  }

  /** Re-fetch any currently-shown tracks for the global range. */
  private reloadTracks(): void {
    if (this.tracks.length > 0) {
      void this.showTracks(this.tracks.map((t) => t.mmsi));
    }
  }

  /** Load and show the full path for a single vessel. */
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

  /** Load full paths (global range) for several vessels; window filtering is
   *  applied client-side when drawing. */
  async showTracks(mmsis: string[]): Promise<void> {
    this.tracksController?.abort();
    const controller = new AbortController();
    this.tracksController = controller;
    this.tracks = [];
    try {
      const results = await Promise.all(
        mmsis.map(async (mmsi) => ({
          mmsi,
          points: await fetchVesselTrack(mmsi, this.rangeStartIso, this.rangeEndIso, controller.signal),
        })),
      );
      if (this.tracksController !== controller) return;
      runInAction(() => {
        this.tracks = results;
      });
    } catch (error) {
      if (!isAbort(error)) console.error('Failed to load tracks:', error);
    }
  }

  clearTracks(): void {
    this.tracksController?.abort();
    this.tracksController = null;
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
    this.loadController?.abort();
    const controller = new AbortController();
    this.loadController = controller;
    try {
      const pings = await fetchAllPings(
        this.rangeStartIso,
        this.rangeEndIso,
        this.viewport,
        controller.signal,
      );
      if (this.loadController !== controller) return;
      runInAction(() => {
        this.allPings = pings.map((p) => ({ ...p, tMs: Date.parse(p.ts) }));
        this.loaded = true;
        this.recompute();
      });
    } catch (error) {
      if (!isAbort(error)) console.error('Failed to load pings:', error);
    }
  }
}
