import { useCallback } from 'react';

import { ANALYSES } from '../analyses_configs';
import { useStores } from '../stores/StoreContext';
import type { Job } from '../stores/JobStore';

/**
 * Returns a function that applies (combines) a set of jobs: union date range,
 * combined events, and merged AOI device tracks. Passing an empty list clears
 * the results and the New-job widgets.
 */
export function useApplyJobs() {
  const { job, analysis, event, ping, layers, aoi } = useStores();

  return useCallback(
    async (jobs: Job[]) => {
      if (jobs.length === 0) {
        event.clearJob();
        ping.clearAoiDeviceTracks();
        ping.clearJobTracks();
        analysis.reset();
        aoi.setFromWkt(null);
        layers.clearLayers();
        job.setEditing(null);
        return;
      }

      // Global date range = union of all applied jobs' ranges.
      const froms = jobs.map((j) => j.fromIso).filter((x): x is string => Boolean(x));
      const tos = jobs.map((j) => j.toIso).filter((x): x is string => Boolean(x));
      if (froms.length > 0 && tos.length > 0) {
        const minFrom = froms.reduce((a, b) => (a < b ? a : b));
        const maxTo = tos.reduce((a, b) => (a > b ? a : b));
        ping.applyRange(minFrom.slice(0, 10), maxTo.slice(0, 10));
      }

      // Run each job's analysis and combine the produced events.
      const events = await analysis.runJobs(
        jobs.map((j) => ({
          analysisConfigId: j.analysisConfigId,
          wkt: j.aoiWkt,
          fromIso: j.fromIso,
          toIso: j.toIso,
          settings: j.analysisConfig ?? undefined,
        })),
      );
      event.setJobEvents(events);
      ping.clearJobTracks();

      // Merge AOI device tracks across the jobs whose analyses declare them.
      const aoiJobs = jobs
        .filter((j) => {
          const config = ANALYSES.find((a) => a.id === j.analysisConfigId);
          return config?.layers_config.some((layer) => layer.config?.aoi_bounded);
        })
        .map((j) => ({ wkt: j.aoiWkt, mmsis: j.analysisConfig?.mmsis ?? [] }));
      if (aoiJobs.length > 0) {
        await ping.loadAoiDeviceTracksForJobs(aoiJobs);
      } else {
        ping.clearAoiDeviceTracks();
      }

      layers.showAll();
    },
    [job, analysis, event, ping, layers, aoi],
  );
}
