import { makeAutoObservable, runInAction } from 'mobx';

import { fetchGeofenceEvents, type MapEvent } from '../api/events';

/** Holds analytics events (currently geofence enter/exit) for the map. */
export class EventStore {
  geofence: MapEvent[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  /** Load geofence events within the given date range. */
  async loadGeofence(fromDate: string, toDate: string): Promise<void> {
    try {
      const events = await fetchGeofenceEvents(fromDate, toDate);
      runInAction(() => {
        this.geofence = events;
      });
    } catch (error) {
      console.error('Failed to load geofence events:', error);
    }
  }
}
