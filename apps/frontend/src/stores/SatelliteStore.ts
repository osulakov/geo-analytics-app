import { makeAutoObservable, runInAction } from 'mobx';

import { fetchSatellites, type Satellite } from '../api/satellites';

/**
 * Holds the satellite list for the Satellites widget, plus per-satellite toggle
 * state for the orbit and chasing-coverage overlays. The toggles only track
 * which satellites are switched on — the actual map rendering is wired later.
 */
export class SatelliteStore {
  satellites: Satellite[] = [];
  loaded = false;

  /** Names with their orbit drawn on the map. */
  orbitOn = new Set<string>();
  /** Names currently being chased (coverage follow). */
  chasingOn = new Set<string>();

  constructor() {
    makeAutoObservable(this);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const satellites = await fetchSatellites();
      runInAction(() => {
        this.satellites = satellites;
        this.loaded = true;
      });
    } catch (error) {
      console.error('Failed to load satellites:', error);
    }
  }

  isOrbitOn(name: string): boolean {
    return this.orbitOn.has(name);
  }

  toggleOrbit(name: string): void {
    if (this.orbitOn.has(name)) this.orbitOn.delete(name);
    else this.orbitOn.add(name);
  }

  isChasing(name: string): boolean {
    return this.chasingOn.has(name);
  }

  toggleChasing(name: string): void {
    if (this.chasingOn.has(name)) this.chasingOn.delete(name);
    else this.chasingOn.add(name);
  }
}
