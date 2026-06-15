import { useEffect, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';

import { AnalysesWidget } from '../components/AnalysesWidget';
import { AoisWidget } from '../components/AoisWidget';
import { AppliedJobsBar } from '../components/AppliedJobsBar';
import { AoiTooltip } from '../layers_controller/AoiTooltip';
import { Brand } from '../components/Brand';
import { ChatWidget } from '../components/ChatWidget';
import { DateRangeWidget } from '../components/DateRangeWidget';
import { EventCounter } from '../components/EventCounter';
import { EezTooltip } from '../layers_controller/EezTooltip';
import { EventTooltip } from '../layers_controller/EventTooltip';
import {
  GlobeCanvas,
  type AoiHover,
  type EezHover,
  type EventHover,
  type PingHover,
  type SatelliteHover,
} from '../layers_controller/GlobeCanvas';
import { GlobeControls } from '../components/GlobeControls';
import { JobResultsColumn } from '../components/JobResultsColumn';
// Vessels widget is hidden for now; it'll show with a recent job.
// import { VesselsWidget } from '../components/VesselsWidget';
import { RecentJobsWidget } from '../components/RecentJobsWidget';
import { RunJobWidget } from '../components/RunJobWidget';
import { SatelliteCounter } from '../components/SatelliteCounter';
import { SatelliteTooltip } from '../layers_controller/SatelliteTooltip';
import { DataWidget } from '../components/DataWidget';
import { ShipCounter } from '../components/ShipCounter';
import { TimeSlider } from '../components/TimeSlider';
import { VesselModal } from '../components/VesselModal';
// import { VesselsWidget } from '../components/VesselsWidget';
import { VesselTooltip } from '../layers_controller/VesselTooltip';
import { WelcomeBadge } from '../components/WelcomeBadge';
import { useStores } from '../stores/StoreContext';

export function ExplorePage() {
  const stores = useStores();
  const [hover, setHover] = useState<PingHover | null>(null);
  const [eezHover, setEezHover] = useState<EezHover | null>(null);
  const [aoiHover, setAoiHover] = useState<AoiHover | null>(null);
  const [eventHover, setEventHover] = useState<EventHover | null>(null);
  const [satHover, setSatHover] = useState<SatelliteHover | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Top-left toolbar: radio-style — exactly one widget group is shown.
  const [activeNav, setActiveNav] = useState<'newJob' | 'recentJobs'>('newJob');
  const showNewJob = activeNav === 'newJob';
  const showRecentJobs = activeNav === 'recentJobs';

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
    // Events are not fetched from the DB for the map; they come only from a job
    // run (Run Job → the analysis' produced events).
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
        onAoiHover={setAoiHover}
        onEventHover={setEventHover}
        onSatelliteHover={setSatHover}
        onSelect={handleSelect}
        onViewportChange={handleViewport}
      />
      <GlobeControls />
      <TimeSlider />
      <ChatWidget />
      <div className="right-stack">
        <WelcomeBadge />
        <div className="right-stack__counters">
          <ShipCounter />
          <SatelliteCounter />
          <EventCounter />
        </div>
        <DataWidget />
      </div>
      <div className="left-region">
        <Brand />
        <div className="left-region__body">
          <div className="globe-controls widget-toolbar">
            <button
              type="button"
              className={showNewJob ? 'active' : ''}
              title="New job — date range, AOIs, analyses"
              aria-label="Show new job widgets"
              role="radio"
              aria-checked={showNewJob}
              onClick={() => setActiveNav('newJob')}
            >
              <AddIcon fontSize="small" />
            </button>
            <button
              type="button"
              className={showRecentJobs ? 'active' : ''}
              title="Recent jobs"
              aria-label="Show recent jobs"
              role="radio"
              aria-checked={showRecentJobs}
              onClick={() => setActiveNav('recentJobs')}
            >
              <HistoryIcon fontSize="small" />
            </button>
          </div>
          <div className="left-stack">
            {showNewJob && <AppliedJobsBar />}
            {showNewJob && <DateRangeWidget />}
            {showNewJob && <AoisWidget />}
            {showNewJob && <AnalysesWidget />}
            {showNewJob && <RunJobWidget />}
            {showRecentJobs && <RecentJobsWidget />}
          </div>
          {/* Second column: Layers + Vessels for the applied job results, in
              both views (renders only when there are results). */}
          <JobResultsColumn />
        </div>
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
      {aoiHover && !satHover && !hover && !eventHover && !selected && (
        <AoiTooltip
          name={aoiHover.name}
          areaKm2={aoiHover.areaKm2}
          x={aoiHover.x}
          y={aoiHover.y}
        />
      )}
      {eezHover && !satHover && !hover && !eventHover && !aoiHover && !selected && (
        <EezTooltip name={eezHover.name} x={eezHover.x} y={eezHover.y} />
      )}
      {selected && (
        <VesselModal mmsi={selected} onClose={handleClose} onShowPath={handleShowPath} />
      )}
    </main>
  );
}
