import { makeAutoObservable, runInAction } from 'mobx';

import { fetchSatellites, type Satellite } from '../data_loaders/satellites';

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
  /** The currently selected satellite (pulses + glows on the map). */
  selectedName: string | null = null;
  /** Master visibility for the whole satellite layer (pings, orbits, coverage). */
  visible = false;

  constructor() {
    makeAutoObservable(this);
  }

  toggleVisible(): void {
    this.visible = !this.visible;
  }

  isSelected(name: string): boolean {
    return this.selectedName === name;
  }

  /** Toggle selection: clicking the selected satellite again clears it. */
  select(name: string): void {
    this.selectedName = this.selectedName === name ? null : name;
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

  /** True when at least one satellite's orbit is shown. */
  get anyOrbitOn(): boolean {
    return this.orbitOn.size > 0;
  }

  /** Show every orbit, or hide them all if any are currently shown. */
  toggleAllOrbits(): void {
    if (this.orbitOn.size > 0) this.orbitOn.clear();
    else this.orbitOn = new Set(this.satellites.map((s) => s.name));
  }

  isChasing(name: string): boolean {
    return this.chasingOn.has(name);
  }

  toggleChasing(name: string): void {
    if (this.chasingOn.has(name)) this.chasingOn.delete(name);
    else this.chasingOn.add(name);
  }
}
