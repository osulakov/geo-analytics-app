import { AnalysisStore } from './AnalysisStore';
import { AoiStore } from './AoiStore';
import { AuthStore } from './AuthStore';
import { ChatStore } from './ChatStore';
import { DetectionStore } from './DetectionStore';
import { EventStore } from './EventStore';
import { GlobeStore } from './GlobeStore';
import { GroupStore } from './GroupStore';
import { ImageryStore } from './ImageryStore';
import { JobStore } from './JobStore';
import { LayerStore } from '../layers_visibilities/LayerStore';
import { MockStore } from './MockStore';
import { PingStore } from './PingStore';
import { SatelliteStore } from './SatelliteStore';
import { VesselStore } from './VesselStore';

/** Aggregates all domain stores. New stores get wired in here. */
export class RootStore {
  auth: AuthStore;
  globe: GlobeStore;
  chat: ChatStore;
  ping: PingStore;
  vessel: VesselStore;
  satellite: SatelliteStore;
  group: GroupStore;
  layers: LayerStore;
  event: EventStore;
  aoi: AoiStore;
  analysis: AnalysisStore;
  job: JobStore;
  mock: MockStore;
  imagery: ImageryStore;
  detection: DetectionStore;

  constructor() {
    this.auth = new AuthStore();
    this.mock = new MockStore();
    this.aoi = new AoiStore(this.auth);
    this.analysis = new AnalysisStore();
    this.job = new JobStore(this.auth);
    this.globe = new GlobeStore();
    this.chat = new ChatStore();
    this.ping = new PingStore();
    this.vessel = new VesselStore();
    this.satellite = new SatelliteStore();
    this.group = new GroupStore();
    this.layers = new LayerStore();
    this.event = new EventStore();
    this.imagery = new ImageryStore();
    this.detection = new DetectionStore(this.auth);
  }
}
