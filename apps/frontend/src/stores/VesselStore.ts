import { makeAutoObservable, runInAction } from "mobx";

import {
  fetchStaticVesselInfo,
  type StaticVesselInfo,
} from "../data_loaders/vessels";

/** Holds the full static vessel list for the Vessels widget. */
export class VesselStore {
  vessels: StaticVesselInfo[] = [];
  loaded = false;

  constructor() {
    makeAutoObservable(this);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    await this.reload();
  }

  /** Force a re-fetch (e.g. after mocking a new vessel). */
  async reload(): Promise<void> {
    try {
      const vessels = await fetchStaticVesselInfo();
      runInAction(() => {
        this.vessels = vessels;
        this.loaded = true;
      });
    } catch (error) {
      console.error("Failed to load vessels:", error);
    }
  }
}
