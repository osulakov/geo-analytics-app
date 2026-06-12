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

// Persistent low-detail base layer: a hemisphere-wide, heavily decimated sample
// that always provides coverage so zooming out never shows an empty globe. It
// reloads only when the view CENTRE moves (pan) past BASE_RELOAD_DEG, not on zoom.
const HEMISPHERE_RADIUS_M = (Math.PI / 2) * 6_371_000;
const BASE_BUCKET = 10;
const BASE_RELOAD_DEG = 20;

/** Rough angular distance (degrees) between two lon/lat points. */
function angularDistanceDeg(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const dLat = a.lat - b.lat;
  let dLon = a.lon - b.lon;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  const latAvg = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  return Math.hypot(dLat, dLon * Math.cos(latAvg));
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
  // Detail layer: pings for the current viewport cap + zoom decimation.
  allPings: TimedPing[] = [];
  // Base layer: persistent low-detail hemisphere sample (kept across zoom).
  basePings: TimedPing[] = [];
  // Displayed pings: latest-per-vessel within the active window (base + detail).
  // Recomputed only on load / window change (a plain field, not a computed).
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
  baseController: AbortController | null = null;
  tracksController: AbortController | null = null;

  // Centre of the currently-loaded base layer (null until first load).
  baseCenter: { lon: number; lat: number } | null = null;

  // Vessels whose latest ping pulses (single selection or a whole group).
  highlightMmsis: string[] = [];

  // Group currently shown on the map (its eye toggle is "on"), if any.
  shownGroupId: number | null = null;

  // When set, the map shows ONLY these vessels (group filter); null = all.
  filterMmsis: string[] | null = null;
  filteredGroupId: number | null = null;

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
      baseController: false,
      tracksController: false,
      allPings: observable.ref,
      basePings: observable.ref,
      pings: observable.ref,
      filterMmsis: observable.ref,
    });
  }

  get rangeStartIso(): string {
    return dayStartIso(this.fromDate);
  }

  get rangeEndIso(): string {
    return dayEndIso(this.toDate);
  }

  /** Recompute displayed pings: latest-per-vessel within the active window,
   *  merging the base + detail layers (and, if a group filter is active, only
   *  that group's vessels). */
  private recompute(): void {
    const start = Date.parse(this.windowStart);
    const end = Date.parse(this.windowEnd);
    const allow = this.filterMmsis ? new Set(this.filterMmsis) : null;
    const latest = new Map<string, LatestPing>();
    const consider = (arr: TimedPing[]) => {
      // Arrays are ordered by (mmsi, ts asc), so the last in-window wins.
      for (const ping of arr) {
        if (ping.tMs < start || ping.tMs > end) continue;
        if (allow && !allow.has(ping.mmsi)) continue;
        latest.set(ping.mmsi, ping);
      }
    };
    consider(this.basePings);
    consider(this.allPings); // detail overrides base for shared vessels
    this.pings = Array.from(latest.values());
  }

  /** Show only this group's vessels on the map (hide all others). Reloads so
   *  every group member is fetched in full (no viewport cap, no decimation). */
  setFilter(groupId: number, mmsis: string[]): void {
    this.filteredGroupId = groupId;
    this.filterMmsis = mmsis;
    void this.loadDetail();
  }

  /** Clear the group filter (back to viewport + zoom-decimated loading). */
  clearFilter(): void {
    this.filteredGroupId = null;
    this.filterMmsis = null;
    void this.loadDetail();
  }

  /** Set the viewport (pan/zoom). Always reloads the detail layer; reloads the
   *  base layer only when the centre moved enough (i.e. pan, not zoom). */
  setViewport(cap: ViewportCap): void {
    this.viewport = cap;
    void this.loadDetail();
    if (
      this.baseCenter === null ||
      angularDistanceDeg(cap, this.baseCenter) > BASE_RELOAD_DEG
    ) {
      this.baseCenter = { lon: cap.lon, lat: cap.lat };
      void this.loadBase();
    }
  }

  /** Update the global range, reset the active window to it, and reload all. */
  applyRange(fromDate: string, toDate: string): void {
    this.fromDate = fromDate;
    this.toDate = toDate;
    this.windowStart = dayStartIso(fromDate);
    this.windowEnd = dayEndIso(toDate);
    void this.loadDetail();
    void this.loadBase();
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

  /** Detail layer: current viewport (cap + zoom decimation) or group members. */
  async loadDetail(): Promise<void> {
    this.loadController?.abort();
    const controller = new AbortController();
    this.loadController = controller;
    try {
      // Group filter → fetch all its members; otherwise viewport cap + decimation.
      const query =
        this.filterMmsis && this.filterMmsis.length > 0
          ? { fromIso: this.rangeStartIso, toIso: this.rangeEndIso, mmsis: this.filterMmsis }
          : { fromIso: this.rangeStartIso, toIso: this.rangeEndIso, cap: this.viewport };
      const pings = await fetchAllPings(query, controller.signal);
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

  /** Base layer: low-detail hemisphere sample around the current centre. */
  async loadBase(): Promise<void> {
    if (!this.baseCenter) return;
    this.baseController?.abort();
    const controller = new AbortController();
    this.baseController = controller;
    const cap: ViewportCap = {
      lon: this.baseCenter.lon,
      lat: this.baseCenter.lat,
      radius: HEMISPHERE_RADIUS_M,
      maxBucket: BASE_BUCKET,
    };
    try {
      const pings = await fetchAllPings(
        { fromIso: this.rangeStartIso, toIso: this.rangeEndIso, cap },
        controller.signal,
      );
      if (this.baseController !== controller) return;
      runInAction(() => {
        this.basePings = pings.map((p) => ({ ...p, tMs: Date.parse(p.ts) }));
        this.recompute();
      });
    } catch (error) {
      if (!isAbort(error)) console.error('Failed to load base pings:', error);
    }
  }
}
