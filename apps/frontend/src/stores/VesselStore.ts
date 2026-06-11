import { makeAutoObservable, runInAction } from 'mobx';

import { fetchStaticVesselInfo, type StaticVesselInfo } from '../api/vessels';

/** Holds the full static vessel list for the Vessels widget. */
export class VesselStore {
  vessels: StaticVesselInfo[] = [];
  loaded = false;

  constructor() {
    makeAutoObservable(this);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const vessels = await fetchStaticVesselInfo();
      runInAction(() => {
        this.vessels = vessels;
        this.loaded = true;
      });
    } catch (error) {
      console.error('Failed to load vessels:', error);
    }
  }
}
