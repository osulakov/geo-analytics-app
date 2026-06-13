import { makeAutoObservable, runInAction } from 'mobx';
import { geoArea, geoContains } from 'd3-geo';

import type { AuthStore } from './AuthStore';

const EARTH_RADIUS_M = 6_371_000;

export interface Aoi {
  id: string;
  name: string;
  /** Polygon ring as [lon, lat] pairs, without the closing duplicate point. */
  coordinates: [number, number][];
  /** Spherical area in square kilometres. */
  areaKm2: number;
  /** Whether this AOI has been saved to the user's library in the DB. */
  saved: boolean;
  /** Set while a save-to-library request is in flight. */
  saving: boolean;
}

/** Spherical area (steradians) of a closed ring, clamped to the smaller side. */
function ringSteradians(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const ring = [...coords, coords[0]];
  const sr = geoArea({ type: 'Polygon', coordinates: [ring] });
  return sr > 2 * Math.PI ? 4 * Math.PI - sr : sr;
}

/** Reorder a ring so its enclosed (left-of-edge) area is the smaller region —
 *  keeps d3 polygon fills from flooding the whole globe on clockwise input. */
function normalizeWinding(coords: [number, number][]): [number, number][] {
  if (coords.length < 3) return coords;
  const ring = [...coords, coords[0]];
  const sr = geoArea({ type: 'Polygon', coordinates: [ring] });
  return sr > 2 * Math.PI ? [...coords].reverse() : coords;
}

/** Server-persisted AOIs have a numeric id; session-only drafts use `aoi-…`. */
const isServerId = (id: string): boolean => /^\d+$/.test(id);

/**
 * Areas of Interest drawn on the globe. AOIs live only in this store (temporary
 * for the session); the user can explicitly save any of them to their library
 * in the DB (`POST /aois`, scoped to their user id) without removing them here.
 */
export class AoiStore {
  aois: Aoi[] = [];
  drawing = false;
  draftPoints: [number, number][] = [];
  /** The signed-in user's saved AOIs (loaded from the DB) and whether the
   *  Library view is open (shown in the list + drawn on the map). */
  library: Aoi[] = [];
  libraryOpen = false;
  private counter = 0;

  constructor(private auth: AuthStore) {
    makeAutoObservable(this, { auth: false } as never);
  }

  /** Whether the draft has enough points to be closed into a polygon. */
  get canFinish(): boolean {
    return this.draftPoints.length >= 3;
  }

  /** Whether the library (save/load) is available — requires being signed in. */
  get canUseLibrary(): boolean {
    return Boolean(this.auth.token);
  }

  /** Open/close the Library; loads the user's saved AOIs from the DB on open. */
  async toggleLibrary(): Promise<void> {
    if (this.libraryOpen) {
      runInAction(() => (this.libraryOpen = false));
      return;
    }
    runInAction(() => (this.libraryOpen = true));
    await this.loadLibrary();
  }

  /** Fetch the signed-in user's saved AOIs into `library`. */
  async loadLibrary(): Promise<void> {
    if (!this.auth.token) return;
    try {
      const res = await fetch('/aois', { headers: { Authorization: `Bearer ${this.auth.token}` } });
      if (!res.ok) return;
      const data = (await res.json()) as Omit<Aoi, 'saved' | 'saving'>[];
      runInAction(() => {
        this.library = data.map((a) => ({ ...a, saved: true, saving: false }));
      });
    } catch (error) {
      console.error('Failed to load AOI library:', error);
    }
  }

  startDrawing(): void {
    this.drawing = true;
    this.draftPoints = [];
  }

  cancelDrawing(): void {
    this.drawing = false;
    this.draftPoints = [];
  }

  toggleDrawing(): void {
    if (this.drawing) this.cancelDrawing();
    else this.startDrawing();
  }

  addPoint(lon: number, lat: number): void {
    if (!this.drawing) return;
    this.draftPoints = [...this.draftPoints, [lon, lat]];
  }

  /** Close the draft into an AOI (needs ≥3 points). Stored locally only. */
  finishDrawing(): void {
    if (this.draftPoints.length < 3) {
      this.cancelDrawing();
      return;
    }
    this.counter += 1;
    const coordinates = normalizeWinding(this.draftPoints);
    this.aois = [
      ...this.aois,
      {
        id: `aoi-${Date.now()}-${this.counter}`,
        name: `AOI ${this.counter}`,
        coordinates,
        areaKm2: (ringSteradians(coordinates) * EARTH_RADIUS_M * EARTH_RADIUS_M) / 1e6,
        saved: false,
        saving: false,
      },
    ];
    this.drawing = false;
    this.draftPoints = [];
  }

  /** Update an AOI's name locally as the user types (no network call). */
  renameAoi(id: string, name: string): void {
    this.aois = this.aois.map((aoi) => (aoi.id === id ? { ...aoi, name } : aoi));
    this.library = this.library.map((aoi) => (aoi.id === id ? { ...aoi, name } : aoi));
  }

  /** Persist the current name of a saved (server-id) AOI to the DB. Called when
   *  the user commits the edit (Enter / blur). No-op for session-only AOIs. */
  commitRename(id: string): void {
    if (!this.auth.token || !isServerId(id)) return;
    const aoi = this.library.find((a) => a.id === id) ?? this.aois.find((a) => a.id === id);
    if (!aoi) return;
    void fetch(`/aois/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.auth.token}` },
      body: JSON.stringify({ name: aoi.name }),
    }).catch((error) => console.error('Failed to rename AOI:', error));
  }

  removeAoi(id: string): void {
    this.aois = this.aois.filter((aoi) => aoi.id !== id);
    this.library = this.library.filter((aoi) => aoi.id !== id);
    if (this.auth.token && isServerId(id)) {
      void fetch(`/aois/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.auth.token}` },
      }).catch((error) => console.error('Failed to delete AOI:', error));
    }
  }

  /** Remove an AOI from the Added (working) list only. Does NOT touch the
   *  library or the DB — used by the Added-list trash button. */
  removeFromAdded(id: string): void {
    this.aois = this.aois.filter((aoi) => aoi.id !== id);
  }

  /** Add an AOI to the Added list (drawn yellow on the map). A library-only
   *  AOI is copied in; an already-added one is a no-op. */
  selectAoi(id: string): void {
    if (this.aois.some((a) => a.id === id)) return;
    const fromLibrary = this.library.find((a) => a.id === id);
    if (fromLibrary) this.aois = [...this.aois, fromLibrary];
  }

  /** Whether an AOI is in the Added list (and thus drawn yellow). */
  isAdded(id: string): boolean {
    return this.aois.some((a) => a.id === id);
  }

  /** Id of the topmost AOI containing the given [lon, lat] point, or null. */
  hitTest(point: [number, number]): string | null {
    const candidates = this.libraryOpen ? [...this.aois, ...this.library] : this.aois;
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const aoi = candidates[i];
      if (aoi.coordinates.length < 3) continue;
      const ring = [...aoi.coordinates, aoi.coordinates[0]];
      if (geoContains({ type: 'Polygon', coordinates: [ring] }, point)) return aoi.id;
    }
    return null;
  }

  /** Persist a single AOI to the signed-in user's library; keeps it in the
   *  store and marks it saved. No-op if not authenticated or already saved. */
  async saveToLibrary(id: string): Promise<void> {
    const aoi = this.aois.find((a) => a.id === id);
    if (!aoi || aoi.saved || aoi.saving || !this.auth.token) return;
    this.updateAoi(id, { saving: true });
    try {
      const res = await fetch('/aois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.auth.token}` },
        body: JSON.stringify({
          name: aoi.name,
          coordinates: aoi.coordinates,
          areaKm2: aoi.areaKm2,
        }),
      });
      if (!res.ok) {
        runInAction(() => this.updateAoi(id, { saving: false }));
        return;
      }
      // The server returns the persisted AOI (with its numeric id); add it to
      // the library so the Library list reflects it immediately.
      const created = (await res.json()) as Omit<Aoi, 'saved' | 'saving'>;
      runInAction(() => {
        this.updateAoi(id, { saving: false, saved: true });
        if (!this.library.some((a) => a.id === created.id)) {
          this.library = [...this.library, { ...created, saved: true, saving: false }];
        }
      });
    } catch (error) {
      console.error('Failed to save AOI to library:', error);
      runInAction(() => this.updateAoi(id, { saving: false }));
    }
  }

  /** Whether the library save action is available (signed in). */
  get canSaveToLibrary(): boolean {
    return Boolean(this.auth.token);
  }

  private updateAoi(id: string, patch: Partial<Aoi>): void {
    this.aois = this.aois.map((aoi) => (aoi.id === id ? { ...aoi, ...patch } : aoi));
  }
}
