import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react-lite";
import FilterAltIcon from "@mui/icons-material/FilterAlt";

import { useStores } from "../stores/StoreContext";
import { colorForMmsi } from "../layers_controller/colorMap";
import { GroupEditModal } from "./GroupEditModal";
import type { StaticVesselInfo } from "../data_loaders/vessels";
import type { VesselGroup } from "../data_loaders/groups";

const PAGE_SIZE = 5;

function searchableText(vessel: StaticVesselInfo): string {
  return [
    vessel.mmsi,
    vessel.imo,
    vessel.vesselName,
    vessel.callsign,
    vessel.flagState,
    vessel.vesselType,
    vessel.length,
    vessel.width,
    vessel.draft,
  ]
    .map((value) => (value == null ? "" : String(value)))
    .join(" ")
    .toLowerCase();
}

/**
 * Searchable, paginated list of all vessels. Collapsed by default (title +
 * search); expands on typing or via the chevron. Only one page (5 rows) is
 * ever rendered, regardless of how many vessels exist.
 */
export const VesselsWidget = observer(function VesselsWidget() {
  const { vessel, ping, globe, group } = useStores();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [editGroup, setEditGroup] = useState<VesselGroup | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VesselGroup | null>(null);

  const handleVesselClick = (mmsi: string) => {
    // Fetch this vessel's recent ping directly (it may not be in the paginated
    // viewport sample), merge + pulse it, then fly to it once located.
    void ping.focusVessel(mmsi).then((latest) => {
      if (latest) globe.flyTo(latest.lon, latest.lat);
    });
  };

  const isPathShown = (mmsi: string) =>
    ping.tracks.length === 1 && ping.tracks[0].mmsi === mmsi;

  const togglePath = (mmsi: string) => {
    // Clicking the path button also selects the vessel (glow + fly-to).
    handleVesselClick(mmsi);
    if (isPathShown(mmsi)) ping.clearTracks();
    else void ping.showTrack(mmsi);
  };

  const toggleShowGroup = (g: VesselGroup) => {
    if (ping.shownGroupId === g.id) {
      ping.hideGroup();
    } else {
      // Glow every member's recent ping and load all their tracks (date-ranged).
      void ping.showGroup(g.id, g.mmsis);
    }
  };

  const toggleFilterGroup = (g: VesselGroup) => {
    if (ping.filteredGroupId === g.id) {
      ping.clearFilter();
    } else {
      ping.setFilter(g.id, g.mmsis);
    }
  };

  const confirmDelete = () => {
    if (pendingDelete) void group.deleteGroup(pendingDelete.id);
    setPendingDelete(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vessel.vessels;
    return vessel.vessels.filter((v) => searchableText(v).includes(q));
  }, [query, vessel.vessels]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const handleSearch = (value: string) => {
    setQuery(value);
    setPage(0);
    if (value && !expanded) setExpanded(true);
  };

  return (
    <div className={`vessels-widget${expanded ? "" : " is-collapsed"}`}>
      <button
        type="button"
        className="vessels-widget__header"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span>Vessels</span>
        <svg
          className="vessels-widget__chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div className="vessels-widget__search">
        <input
          type="text"
          value={query}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder="Search vessels"
          aria-label="Search vessels"
        />
      </div>

      {expanded && (
        <div className="vessels-widget__list">
          {pageItems.length === 0 ? (
            <div className="vessels-widget__empty">No vessels found</div>
          ) : (
            pageItems.map((v) => (
              <div key={v.mmsi} className="vessel-row">
                <button
                  type="button"
                  className="vessel-row__select"
                  onClick={() => handleVesselClick(v.mmsi)}
                >
                  <span
                    className="vessel-row__color"
                    style={{ background: colorForMmsi(v.mmsi) }}
                  />
                  <div className="vessel-row__info">
                    <div className="vessel-row__name">{v.vesselName}</div>
                    <div className="vessel-row__meta">
                      {v.mmsi} · {v.flagState ?? "—"} · {v.vesselType ?? "—"}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`vessel-row__path${isPathShown(v.mmsi) ? " is-active" : ""}`}
                  title="Show all path"
                  aria-label="Show all path"
                  onClick={() => togglePath(v.mmsi)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="5 17 12 10 19 5" />
                    <circle
                      cx="5"
                      cy="17"
                      r="2"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="12"
                      cy="10"
                      r="2"
                      fill="currentColor"
                      stroke="none"
                    />
                    <circle
                      cx="19"
                      cy="5"
                      r="2"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}

          <div className="vessels-widget__pager">
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ‹
            </button>
            <span>
              {currentPage + 1} / {pageCount}
              <span className="vessels-widget__count">
                {" "}
                · {filtered.length}
              </span>
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              ›
            </button>
          </div>

          <div className="vessels-widget__groups">
            <div className="vessels-widget__groups-title">Groups</div>
            {group.groups.length === 0 ? (
              <div className="vessels-widget__empty">No groups yet</div>
            ) : (
              group.groups.map((g) => (
                <div key={g.id} className="group-row">
                  <span className="group-row__name">{g.name}</span>
                  <span className="group-row__count">{g.mmsis.length}</span>
                  <button
                    type="button"
                    className={`group-row__icon${
                      ping.shownGroupId === g.id ? " is-shown" : ""
                    }`}
                    title="Show all path"
                    aria-label="Show all path"
                    aria-pressed={ping.shownGroupId === g.id}
                    onClick={() => toggleShowGroup(g)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="5 17 12 10 19 5" />
                      <circle cx="5" cy="17" r="2" fill="currentColor" stroke="none" />
                      <circle cx="12" cy="10" r="2" fill="currentColor" stroke="none" />
                      <circle cx="19" cy="5" r="2" fill="currentColor" stroke="none" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`group-row__icon${
                      ping.filteredGroupId === g.id ? ' is-shown' : ''
                    }`}
                    title={
                      ping.filteredGroupId === g.id
                        ? 'Clear filter (show all vessels)'
                        : 'Filter map to this group only'
                    }
                    aria-label={
                      ping.filteredGroupId === g.id ? 'Clear filter' : 'Filter to group'
                    }
                    aria-pressed={ping.filteredGroupId === g.id}
                    onClick={() => toggleFilterGroup(g)}
                  >
                    <FilterAltIcon sx={{ fontSize: 14 }} />
                  </button>
                  <button
                    type="button"
                    className="group-row__icon"
                    title="Edit group"
                    aria-label="Edit group"
                    onClick={() => setEditGroup(g)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="group-row__icon group-row__icon--danger"
                    title="Delete group"
                    aria-label="Delete group"
                    onClick={() => setPendingDelete(g)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {editGroup && (
        <GroupEditModal group={editGroup} onClose={() => setEditGroup(null)} />
      )}

      {pendingDelete &&
        createPortal(
          <div
            className="confirm-dialog__overlay"
            onClick={() => setPendingDelete(null)}
          >
            <div
              className="confirm-dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="confirm-dialog__text">
                Delete group “{pendingDelete.name}”?
              </div>
              <div className="confirm-dialog__actions">
                <button
                  type="button"
                  className="confirm-dialog__cancel"
                  onClick={() => setPendingDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="confirm-dialog__delete"
                  onClick={confirmDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
});
