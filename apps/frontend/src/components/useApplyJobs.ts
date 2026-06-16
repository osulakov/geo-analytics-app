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
  const { job, analysis, event, ping, layers, aoi, detection } = useStores();

  return useCallback(
    async (jobs: Job[]) => {
      if (jobs.length === 0) {
        event.clearJob();
        ping.clearAoiDeviceTracks();
        ping.clearJobTracks();
        detection.clear();
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

      // Split jobs by whether their analysis re-runs on invoke. SQL analyses
      // (geofence) recompute their events; analyses that persist results
      // (object detection) just load their stored detections — no re-run.
      const runOnInvoke = (j: Job) =>
        ANALYSES.find((a) => a.id === j.analysisConfigId)?.should_run_on_invoke ?? true;
      const sqlJobs = jobs.filter(runOnInvoke);
      const detectionJobs = jobs.filter((j) => !runOnInvoke(j));

      // Run each SQL job's analysis and combine the produced events.
      const events = await analysis.runJobs(
        sqlJobs.map((j) => ({
          analysisConfigId: j.analysisConfigId,
          wkt: j.aoiWkt,
          fromIso: j.fromIso,
          toIso: j.toIso,
          settings: j.analysisConfig ?? undefined,
        })),
      );
      event.setJobEvents(events);
      ping.clearJobTracks();

      // Load persisted object detections (read-only) for any detection jobs.
      if (detectionJobs.length > 0) {
        await detection.loadMany(detectionJobs.map((j) => j.id));
      } else {
        detection.clear();
      }

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
    [job, analysis, event, ping, layers, aoi, detection],
  );
}
