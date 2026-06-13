import { makeAutoObservable } from 'mobx';

/**
 * Visibility of map layers. Currently one layer — "Device tracks" — with a
 * "pings" sublayer. The parent acts as a master switch for the group.
 */
export class LayerStore {
  /** Master switch for the Device-tracks layer group. */
  deviceTracksVisible = true;
  /** Sublayer: latest ping markers. */
  pingsVisible = true;
  /** Whether the Device-tracks sublayers are expanded (collapsed by default). */
  deviceTracksExpanded = false;

  /** Geofence enter/exit event markers. */
  geofenceVisible = false;

  /** AIS-off (gap) event markers. */
  aisOffVisible = false;

  constructor() {
    makeAutoObservable(this);
  }

  /** Effective visibility of the ping markers. */
  get pingsActive(): boolean {
    return this.deviceTracksVisible && this.pingsVisible;
  }

  toggleDeviceTracks(): void {
    const next = !this.deviceTracksVisible;
    this.deviceTracksVisible = next;
    // Cascade to all sublayers.
    this.pingsVisible = next;
  }

  togglePings(): void {
    this.pingsVisible = !this.pingsVisible;
    // Parent reflects its sublayers: on if any sublayer is on, off if none are.
    this.deviceTracksVisible = this.pingsVisible;
  }

  toggleDeviceTracksExpanded(): void {
    this.deviceTracksExpanded = !this.deviceTracksExpanded;
  }

  toggleGeofence(): void {
    this.geofenceVisible = !this.geofenceVisible;
  }

  toggleAisOff(): void {
    this.aisOffVisible = !this.aisOffVisible;
  }
}
