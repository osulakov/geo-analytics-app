import { useEffect, useState } from 'react';

import { Brand } from '../components/Brand';
import { ChatWidget } from '../components/ChatWidget';
import { DateRangeWidget } from '../components/DateRangeWidget';
import { EventCounter } from '../components/EventCounter';
import { EezTooltip } from '../layers_controller/EezTooltip';
import { EventTooltip } from '../layers_controller/EventTooltip';
import {
  GlobeCanvas,
  type EezHover,
  type EventHover,
  type PingHover,
  type SatelliteHover,
} from '../layers_controller/GlobeCanvas';
import { GlobeControls } from '../components/GlobeControls';
import { LayersWidget } from '../components/LayersWidget';
import { SatelliteCounter } from '../components/SatelliteCounter';
import { SatelliteTooltip } from '../layers_controller/SatelliteTooltip';
import { SatellitesWidget } from '../components/SatellitesWidget';
import { ShipCounter } from '../components/ShipCounter';
import { TimeSlider } from '../components/TimeSlider';
import { VesselModal } from '../components/VesselModal';
import { VesselsWidget } from '../components/VesselsWidget';
import { VesselTooltip } from '../layers_controller/VesselTooltip';
import { useStores } from '../stores/StoreContext';

export function LandingPage() {
  const stores = useStores();
  const [hover, setHover] = useState<PingHover | null>(null);
  const [eezHover, setEezHover] = useState<EezHover | null>(null);
  const [eventHover, setEventHover] = useState<EventHover | null>(null);
  const [satHover, setSatHover] = useState<SatelliteHover | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    // Pings/events load per-viewport once the globe reports its first cap.
    stores.vessel.load();
    stores.satellite.load();
    stores.group.loadGroups();
    void stores.ping.loadActiveCount();
  }, [stores]);

  // Reload pings + events for the visible cap whenever the view settles.
  const handleViewport = (cap: {
    lon: number;
    lat: number;
    radius: number;
    maxBucket: number;
  }) => {
    stores.ping.setViewport(cap);
    void stores.event.loadGeofence(stores.ping.rangeStartIso, stores.ping.rangeEndIso, cap);
  };

  const handleSelect = (mmsi: string) => {
    // Opening the modal clears the hover tooltip and any previous path, and
    // marks the vessel as selected (glowing pulse) — without flying to it.
    setHover(null);
    stores.ping.clearTracks();
    stores.ping.setHighlight(mmsi);
    setSelected(mmsi);
  };

  const handleClose = () => {
    setSelected(null);
    stores.ping.clearTracks();
  };

  const handleShowPath = (mmsi: string) => {
    setSelected(null);
    void stores.ping.showTrack(mmsi).then(() => {
      console.log(`Full path for ${mmsi}:`, stores.ping.tracks);
    });
  };

  return (
    <main
      style={{
        position: 'relative',
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 40%, #11151b 0%, #0b0d10 70%)',
      }}
    >
      <GlobeCanvas
        onHover={setHover}
        onEezHover={setEezHover}
        onEventHover={setEventHover}
        onSatelliteHover={setSatHover}
        onSelect={handleSelect}
        onViewportChange={handleViewport}
      />
      <GlobeControls />
      <TimeSlider />
      <ChatWidget />
      <div className="right-stack">
        <div className="right-stack__counters">
          <ShipCounter />
          <SatelliteCounter />
          <EventCounter />
        </div>
        <SatellitesWidget />
      </div>
      <div className="left-stack">
        <Brand />
        <DateRangeWidget />
        <VesselsWidget />
        <LayersWidget />
      </div>
      {satHover && !selected && (
        <SatelliteTooltip
          satellite={satHover.satellite}
          area={satHover.area}
          x={satHover.x}
          y={satHover.y}
        />
      )}
      {hover && !satHover && !selected && (
        <VesselTooltip
          mmsi={hover.mmsi}
          x={hover.x}
          y={hover.y}
          ts={hover.ts}
          heading={hover.heading}
        />
      )}
      {eventHover && !satHover && !hover && !selected && (
        <EventTooltip event={eventHover.event} x={eventHover.x} y={eventHover.y} />
      )}
      {eezHover && !satHover && !hover && !eventHover && !selected && (
        <EezTooltip name={eezHover.name} x={eezHover.x} y={eezHover.y} />
      )}
      {selected && (
        <VesselModal mmsi={selected} onClose={handleClose} onShowPath={handleShowPath} />
      )}
    </main>
  );
}
