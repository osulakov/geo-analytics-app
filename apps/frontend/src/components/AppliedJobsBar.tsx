import { observer } from 'mobx-react-lite';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';

import { useStores } from '../stores/StoreContext';
import { useApplyJobs } from './useApplyJobs';
import type { Job } from '../stores/JobStore';

/**
 * Applied-jobs list shown at the top of the create view. Clicking a job loads
 * its settings into the create widgets (date range, AOIs, analyses) so it can
 * be modified and re-run in place; the trash removes it from the applied set.
 */
export const AppliedJobsBar = observer(function AppliedJobsBar() {
  const { job, analysis, aoi, ping } = useStores();
  const applyJobs = useApplyJobs();

  if (job.applied.length === 0) return null;

  const edit = (j: Job) => {
    if (j.fromIso && j.toIso) {
      ping.applyRange(j.fromIso.slice(0, 10), j.toIso.slice(0, 10));
    }
    aoi.setFromWkt(j.aoiWkt);
    analysis.setAdded([j.analysisConfigId]);
    if (j.analysisConfig) analysis.setSettings(j.analysisConfigId, j.analysisConfig);
    analysis.setOpenedJobName(j.name);
    job.setEditing(j.id);
  };

  const remove = async (id: string) => {
    job.unapply(id);
    await applyJobs(job.applied);
  };

  return (
    <div className="applied-bar">
      <div className="applied-bar__label">Applied jobs</div>
      <div className="applied-bar__list">
        {job.applied.map((j) => (
          <div
            key={j.id}
            className={`applied-job-row${job.editingId === j.id ? ' is-editing' : ''}`}
          >
            <button
              type="button"
              className="applied-job-row__name"
              title="Edit & re-run this job"
              onClick={() => edit(j)}
            >
              {j.name}
            </button>
            <button
              type="button"
              className="aoi-row__trash"
              title="Remove from applied"
              aria-label="Remove from applied"
              onClick={() => remove(j.id)}
            >
              <DeleteOutlineIcon fontSize="inherit" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});
