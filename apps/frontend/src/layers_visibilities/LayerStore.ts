import { makeAutoObservable } from 'mobx';

import { ANALYSES } from '../analyses_configs';

/**
 * Visibility of map layers.
 *
 * Event layers shown in the Layers widget are declared by analyses
 * (`AnalysisConfig.layers_config`) and tracked here generically by their id, so
 * the widget and store stay in sync with the configs. The "Device tracks" group
 * (with its "pings" sublayer) is a built-in, controlled from the Data widget.
 */
export class LayerStore {
  /** Master switch for the Device-tracks layer group (off by default). */
  deviceTracksVisible = false;
  /** Sublayer: latest ping markers. */
  pingsVisible = false;
  /** Whether the Device-tracks sublayers are expanded (collapsed by default). */
  deviceTracksExpanded = false;

  /** Visible configured event layers, keyed by their `layers_config` id. */
  visibleLayers = new Set<string>();

  constructor() {
    makeAutoObservable(this);
  }

  /** Effective visibility of the ping markers. */
  get pingsActive(): boolean {
    return this.deviceTracksVisible && this.pingsVisible;
  }

  /** Whether a configured layer (by id) is currently shown. */
  isLayerVisible(id: string): boolean {
    return this.visibleLayers.has(id);
  }

  /** Toggle a configured layer's visibility. */
  toggleLayer(id: string): void {
    if (this.visibleLayers.has(id)) this.visibleLayers.delete(id);
    else this.visibleLayers.add(id);
  }

  // Back-compat accessors for the map renderer (read by GlobeCanvas).
  get geofenceVisible(): boolean {
    return this.visibleLayers.has('geofence');
  }

  get aisOffVisible(): boolean {
    return this.visibleLayers.has('ais-off');
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

  /** Reveal the analysis event layers after a job run. Device tracks are left
   *  as-is (off by default) — only the configured event layers are turned on. */
  showAll(): void {
    for (const analysis of ANALYSES) {
      for (const layer of analysis.layers_config) this.visibleLayers.add(layer.id);
    }
  }
}
