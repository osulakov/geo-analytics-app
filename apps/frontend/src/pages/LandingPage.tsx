import { useEffect, useState } from 'react';

import { ChatWidget } from '../components/ChatWidget';
import { GlobeCanvas, type PingHover } from '../components/GlobeCanvas';
import { GlobeControls } from '../components/GlobeControls';
import { VesselTooltip } from '../components/VesselTooltip';
import { useStores } from '../stores/StoreContext';

export function LandingPage() {
  const stores = useStores();
  const [hover, setHover] = useState<PingHover | null>(null);

  useEffect(() => {
    stores.ping.load();
  }, [stores]);

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
      <GlobeCanvas onHover={setHover} />
      <GlobeControls />
      <ChatWidget />
      {hover && <VesselTooltip mmsi={hover.mmsi} x={hover.x} y={hover.y} />}
    </main>
  );
}
