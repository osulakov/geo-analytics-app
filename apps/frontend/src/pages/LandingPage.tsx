import { useEffect, useState } from 'react';

import { Brand } from '../components/Brand';
import { ChatWidget } from '../components/ChatWidget';
import { DateRangeWidget } from '../components/DateRangeWidget';
import { GlobeCanvas, type EezHover, type PingHover } from '../components/GlobeCanvas';
import { GlobeControls } from '../components/GlobeControls';
import { ShipCounter } from '../components/ShipCounter';
import { VesselModal } from '../components/VesselModal';
import { VesselsWidget } from '../components/VesselsWidget';
import { VesselTooltip } from '../components/VesselTooltip';
import { useStores } from '../stores/StoreContext';

export function LandingPage() {
  const stores = useStores();
  const [hover, setHover] = useState<PingHover | null>(null);
  const [eezHover, setEezHover] = useState<EezHover | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    stores.ping.load();
    stores.vessel.load();
    stores.group.loadGroups();
  }, [stores]);

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
      <GlobeCanvas onHover={setHover} onEezHover={setEezHover} onSelect={handleSelect} />
      <GlobeControls />
      <ShipCounter />
      <div className="left-stack">
        <Brand />
        <DateRangeWidget />
        <VesselsWidget />
        <ChatWidget />
      </div>
      {hover && !selected && (
        <VesselTooltip
          mmsi={hover.mmsi}
          x={hover.x}
          y={hover.y}
          ts={hover.ts}
          heading={hover.heading}
        />
      )}
      {eezHover && !hover && !selected && (
        <div className="eez-tooltip" style={{ left: eezHover.x + 14, top: eezHover.y + 14 }}>
          {eezHover.name}
        </div>
      )}
      {selected && (
        <VesselModal mmsi={selected} onClose={handleClose} onShowPath={handleShowPath} />
      )}
    </main>
  );
}
