import { makeAutoObservable, observable, runInAction } from 'mobx';

import {
  fetchActiveVesselCount,
  fetchAllPings,
  fetchAoiDeviceTracks,
  fetchLatestPing,
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

  // Count of distinct vessels with any ping in the global date range (shown in
  // the top counter). Independent of the viewport and the time-slider window.
  activeVesselCount = 0;

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
  // Vessels whose individual path is toggled on (multi-select); the rendered
  // `tracks` is the union of these.
  shownTrackMmsis: string[] = [];

  // In-flight request controllers, so a newer request supersedes an older one.
  loadController: AbortController | null = null;
  baseController: AbortController | null = null;
  tracksController: AbortController | null = null;

  // Centre of the currently-loaded base layer (null until first load).
  baseCenter: { lon: number; lat: number } | null = null;

  // Vessels whose latest ping pulses (single selection or a whole group).
  highlightMmsis: string[] = [];

  // A vessel pinned by an explicit click in the widget: its recent ping is
  // fetched on demand and always merged into the display, so it shows even when
  // it falls outside the current viewport sample / pagination.
  focusedPing: TimedPing | null = null;

  // AOI-bounded device tracks produced by a job (an analysis whose layers_config
  // declares an aoi_bounded device-tracks layer). Kept SEPARATE from the global
  // device-tracks / viewport pings above so the two never interfere.
  aoiPings: LatestPing[] = [];

  // Full paths for the vessels involved in a job's events (loaded on demand via
  // the device-tracks layer's "show full paths" button). Separate from `tracks`
  // (used by the vessels widget / groups).
  jobTracks: VesselTrack[] = [];
  jobTracksController: AbortController | null = null;

  // Groups currently shown on the map (eye toggle on); multi-select. The
  // rendered tracks are the union of these groups' members + shownTrackMmsis.
  shownGroupIds: number[] = [];
  shownGroupMmsis: string[] = [];

  // When set, the map shows ONLY these vessels (union of the filtered groups);
  // null = all. filteredGroupIds drives the per-group toggle state.
  filterMmsis: string[] | null = null;
  filteredGroupIds: number[] = [];

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
      jobTracksController: false,
      allPings: observable.ref,
      basePings: observable.ref,
      pings: observable.ref,
      aoiPings: observable.ref,
      jobTracks: observable.ref,
      filterMmsis: observable.ref,
    });
  }

  /** Load AOI-bounded device tracks (latest ping per vessel inside the AOIs)
   *  for a job, or clear them when there's no AOI. When `mmsis` is non-empty the
   *  tracks are limited to those vessels (the analysis' selected vessels).
   *  Independent of the global device-tracks layer. */
  async loadAoiDeviceTracks(wkt: string | null, mmsis?: string[]): Promise<void> {
    if (!wkt) {
      runInAction(() => {
        this.aoiPings = [];
      });
      return;
    }
    try {
      const pings = await fetchAoiDeviceTracks(wkt, this.rangeStartIso, this.rangeEndIso);
      const allow = mmsis && mmsis.length > 0 ? new Set(mmsis) : null;
      const result = allow ? pings.filter((p) => allow.has(p.mmsi)) : pings;
      runInAction(() => {
        this.aoiPings = result;
      });
    } catch (error) {
      console.error('Failed to load AOI device tracks:', error);
    }
  }

  clearAoiDeviceTracks(): void {
    this.aoiPings = [];
  }

  /** Load + merge AOI device tracks for several jobs (combined applied jobs).
   *  Each job is scoped to its own AOI WKT and (optional) vessel MMSIs; the
   *  union is deduped per vessel. */
  async loadAoiDeviceTracksForJobs(
    jobs: { wkt: string | null; mmsis: string[] }[],
  ): Promise<void> {
    const withWkt = jobs.filter((j): j is { wkt: string; mmsis: string[] } => Boolean(j.wkt));
    if (withWkt.length === 0) {
      runInAction(() => {
        this.aoiPings = [];
      });
      return;
    }
    try {
      const lists = await Promise.all(
        withWkt.map(async (j) => {
          const pings = await fetchAoiDeviceTracks(j.wkt, this.rangeStartIso, this.rangeEndIso);
          const allow = j.mmsis.length > 0 ? new Set(j.mmsis) : null;
          return allow ? pings.filter((p) => allow.has(p.mmsi)) : pings;
        }),
      );
      const byMmsi = new Map<string, LatestPing>();
      for (const list of lists) for (const p of list) byMmsi.set(p.mmsi, p);
      runInAction(() => {
        this.aoiPings = Array.from(byMmsi.values());
      });
    } catch (error) {
      console.error('Failed to load AOI device tracks for jobs:', error);
    }
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
    // A focused (explicitly clicked) vessel is always merged in, so it shows
    // even when outside the viewport sample.
    const fp = this.focusedPing;
    if (fp && fp.tMs >= start && fp.tMs <= end && (!allow || allow.has(fp.mmsi))) {
      latest.set(fp.mmsi, fp);
    }
    this.pings = Array.from(latest.values());
  }

  /**
   * Pin a vessel clicked in the widget: fetch its most recent ping (an extra
   * API call, independent of the paginated viewport load), merge it into the
   * display, highlight it (pulse), and return it so the caller can fly to it.
   * Falls back to any already-loaded ping if the fetch yields nothing.
   */
  async focusVessel(mmsi: string): Promise<LatestPing | null> {
    this.setHighlight(mmsi);
    try {
      const ping = await fetchLatestPing(mmsi, this.rangeStartIso, this.rangeEndIso);
      if (ping) {
        runInAction(() => {
          this.focusedPing = { ...ping, tMs: Date.parse(ping.ts) };
          this.recompute();
        });
        return ping;
      }
    } catch (error) {
      console.error(`Failed to fetch latest ping for ${mmsi}:`, error);
    }
    return this.pings.find((p) => p.mmsi === mmsi) ?? null;
  }

  /** Show only the given groups' vessels (union) on the map; empty = show all.
   *  `mmsis` is the deduped union of the selected groups' members. Reloads so
   *  every member is fetched in full (no viewport cap, no decimation). */
  setFilter(groupIds: number[], mmsis: string[]): void {
    this.filteredGroupIds = groupIds;
    this.filterMmsis = groupIds.length > 0 ? mmsis : null;
    void this.loadDetail();
  }

  /** Clear the group filter (back to viewport + zoom-decimated loading). */
  clearFilter(): void {
    this.setFilter([], []);
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
    void this.loadActiveCount();
    this.rebuildTracks();
  }

  /** Load the count of distinct vessels with pings in the global date range. */
  async loadActiveCount(): Promise<void> {
    try {
      const count = await fetchActiveVesselCount(this.rangeStartIso, this.rangeEndIso);
      runInAction(() => {
        this.activeVesselCount = count;
      });
    } catch (error) {
      console.error('Failed to load active vessel count:', error);
    }
  }

  /** Narrow/widen the active time window (slider) — client-side only, no fetch. */
  setWindow(startIso: string, endIso: string): void {
    this.windowStart = startIso;
    this.windowEnd = endIso;
    this.recompute();
  }

  /** The set of vessels whose tracks should be drawn: individually-shown
   *  vessels ∪ all shown groups' members. */
  private trackUnion(): string[] {
    return [...new Set([...this.shownTrackMmsis, ...this.shownGroupMmsis])];
  }

  /** Re-fetch the current track union (individual + groups) for the range. */
  private rebuildTracks(): void {
    const union = this.trackUnion();
    if (union.length > 0) {
      void this.showTracks(union);
    } else {
      this.tracksController?.abort();
      this.tracksController = null;
      this.tracks = [];
    }
  }

  /** Add a vessel's path to the shown set (used by the modal "Show full path"). */
  async showTrack(mmsi: string): Promise<void> {
    if (!this.shownTrackMmsis.includes(mmsi)) {
      this.shownTrackMmsis = [...this.shownTrackMmsis, mmsi];
    }
    this.rebuildTracks();
  }

  /** Toggle a vessel's path on/off (multi-select); shows the union of all. */
  toggleTrack(mmsi: string): void {
    this.shownTrackMmsis = this.shownTrackMmsis.includes(mmsi)
      ? this.shownTrackMmsis.filter((m) => m !== mmsi)
      : [...this.shownTrackMmsis, mmsi];
    this.rebuildTracks();
  }

  /** Whether a vessel's path is currently shown. */
  isTrackShown(mmsi: string): boolean {
    return this.shownTrackMmsis.includes(mmsi);
  }

  /** Show the given groups (multi-select): glow their members and draw the
   *  union of all shown groups' + individual tracks. `mmsis` is the deduped
   *  union of the selected groups' members; empty groupIds = none shown. */
  setShownGroups(groupIds: number[], mmsis: string[]): void {
    this.shownGroupIds = groupIds;
    this.shownGroupMmsis = groupIds.length > 0 ? mmsis : [];
    this.highlightMmsis = this.shownGroupMmsis;
    this.rebuildTracks();
  }

  /** Whether a group's paths are currently shown. */
  isGroupShown(groupId: number): boolean {
    return this.shownGroupIds.includes(groupId);
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
    this.shownGroupIds = [];
    this.shownGroupMmsis = [];
    this.shownTrackMmsis = [];
  }

  /** Load full paths for the vessels involved in a job's events (its device
   *  tracks). Stored separately from `tracks` so it doesn't disturb the
   *  vessels-widget / group tracks. */
  async showJobTracks(mmsis: string[]): Promise<void> {
    this.jobTracksController?.abort();
    const controller = new AbortController();
    this.jobTracksController = controller;
    try {
      const results = await Promise.all(
        mmsis.map(async (mmsi) => ({
          mmsi,
          points: await fetchVesselTrack(mmsi, this.rangeStartIso, this.rangeEndIso, controller.signal),
        })),
      );
      if (this.jobTracksController !== controller) return;
      runInAction(() => {
        this.jobTracks = results;
      });
    } catch (error) {
      if (!isAbort(error)) console.error('Failed to load job tracks:', error);
    }
  }

  clearJobTracks(): void {
    this.jobTracksController?.abort();
    this.jobTracksController = null;
    this.jobTracks = [];
  }

  /** Whether the job's full paths are currently loaded/shown. */
  get hasJobTracks(): boolean {
    return this.jobTracks.length > 0;
  }

  setHighlight(mmsi: string | null): void {
    this.highlightMmsis = mmsi ? [mmsi] : [];
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
