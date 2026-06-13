import { useState } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import GestureIcon from '@mui/icons-material/Gesture';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CodeIcon from '@mui/icons-material/Code';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAddOutlined';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAddedOutlined';
import AddIcon from '@mui/icons-material/Add';

import { useStores } from '../stores/StoreContext';
import type { Aoi } from '../stores/AoiStore';

interface AoiOption {
  id: string;
  label: string;
  Icon: typeof GestureIcon;
}

const OPTIONS: AoiOption[] = [
  { id: 'draw', label: 'Draw', Icon: GestureIcon },
  { id: 'library', label: 'Library', Icon: CollectionsBookmarkIcon },
  { id: 'upload', label: 'Upload', Icon: UploadFileIcon },
  { id: 'wkt', label: 'Enter WKT', Icon: CodeIcon },
];

const PAGE_SIZE = 5;
const areaFmt = new Intl.NumberFormat();
const formatArea = (km2: number): string => `${areaFmt.format(Math.round(km2))} km²`;

/**
 * Areas of Interest widget. "Draw" toggles polygon-drawing on the globe;
 * "Library" loads the user's saved AOIs. The list shows session drawings under
 * "Added" on top, then the (paginated) "Library" below when open.
 */
export const AoisWidget = observer(function AoisWidget() {
  const { aoi } = useStores();
  const navigate = useNavigate();
  const [pendingDelete, setPendingDelete] = useState<Aoi | null>(null);
  const [addedPage, setAddedPage] = useState(0);
  const [libPage, setLibPage] = useState(0);
  const [libQuery, setLibQuery] = useState('');

  const confirmDelete = () => {
    if (pendingDelete) aoi.removeAoi(pendingDelete.id);
    setPendingDelete(null);
  };

  const handleOption = (id: string) => {
    if (id === 'draw') {
      aoi.toggleDrawing();
    } else if (id === 'library') {
      if (aoi.canUseLibrary) void aoi.toggleLibrary();
      else navigate('/login');
    }
  };

  const handleSave = (id: string) => {
    if (aoi.canSaveToLibrary) void aoi.saveToLibrary(id);
    else navigate('/login');
  };

  const renderRow = (item: Aoi, showSave: boolean) => (
    <div key={item.id} className="aoi-row">
      <input
        className="aoi-row__name"
        value={item.name}
        onChange={(event) => aoi.renameAoi(item.id, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        onBlur={() => aoi.commitRename(item.id)}
        aria-label="AOI name"
      />
      <span className="aoi-row__area">{formatArea(item.areaKm2)}</span>
      {showSave ? (
        <button
          type="button"
          className={`aoi-row__save${item.saved ? ' is-saved' : ''}`}
          title={
            item.saved
              ? 'Saved to your library'
              : aoi.canSaveToLibrary
                ? 'Add to your AOI library'
                : 'Log in to save to your library'
          }
          aria-label={item.saved ? 'Saved to library' : 'Add to library'}
          disabled={item.saved || item.saving}
          onClick={() => handleSave(item.id)}
        >
          {item.saved ? (
            <BookmarkAddedIcon fontSize="inherit" />
          ) : (
            <BookmarkAddIcon fontSize="inherit" />
          )}
        </button>
      ) : (
        <button
          type="button"
          className="aoi-row__add"
          title={aoi.isAdded(item.id) ? 'Already added' : 'Add to Added'}
          aria-label="Add to Added"
          disabled={aoi.isAdded(item.id)}
          onClick={() => aoi.selectAoi(item.id)}
        >
          <AddIcon fontSize="inherit" />
        </button>
      )}
      <button
        type="button"
        className="aoi-row__trash"
        title="Delete AOI"
        aria-label="Delete AOI"
        onClick={() => (showSave ? aoi.removeFromAdded(item.id) : setPendingDelete(item))}
      >
        <DeleteOutlineIcon fontSize="inherit" />
      </button>
    </div>
  );

  // Added (session) pagination (5 per page).
  const addedCount = aoi.aois.length;
  const addedPageCount = Math.max(1, Math.ceil(addedCount / PAGE_SIZE));
  const addedCurrentPage = Math.min(addedPage, addedPageCount - 1);
  const addedStart = addedCurrentPage * PAGE_SIZE;
  const addedPageItems = aoi.aois.slice(addedStart, addedStart + PAGE_SIZE);

  // Library: filter by name, then paginate (5 per page).
  const libCount = aoi.library.length;
  const libQ = libQuery.trim().toLowerCase();
  const libFiltered = libQ
    ? aoi.library.filter((a) => a.name.toLowerCase().includes(libQ))
    : aoi.library;
  const libPageCount = Math.max(1, Math.ceil(libFiltered.length / PAGE_SIZE));
  const libCurrentPage = Math.min(libPage, libPageCount - 1);
  const libStart = libCurrentPage * PAGE_SIZE;
  const libPageItems = libFiltered.slice(libStart, libStart + PAGE_SIZE);

  return (
    <div className="aois-widget">
      <div className="aois-widget__title">AOIs</div>

      <div className="aois-widget__options">
        {OPTIONS.map(({ id, label, Icon }) => {
          const active = (id === 'draw' && aoi.drawing) || (id === 'library' && aoi.libraryOpen);
          return (
            <button
              key={id}
              type="button"
              className={`aoi-option${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => handleOption(id)}
            >
              <Icon fontSize="inherit" className="aoi-option__icon" />
              <span className="aoi-option__label">{label}</span>
            </button>
          );
        })}
      </div>

      {aoi.drawing && (
        <div className="aoi-draw-hint">
          <span className="aoi-draw-hint__text">
            Click to add points, then click the first point to close.
          </span>
          <button type="button" className="aoi-draw-hint__cancel" onClick={() => aoi.cancelDrawing()}>
            Cancel
          </button>
        </div>
      )}

      {/* Session drawings (MobX store), always on top. */}
      {addedCount > 0 && (
        <div className="aoi-section">
          <div className="aoi-section__label">Added</div>
          <div className="aoi-list">{addedPageItems.map((item) => renderRow(item, true))}</div>
          {addedPageCount > 1 && (
            <div className="aoi-pager">
              <button
                type="button"
                aria-label="Previous page"
                disabled={addedCurrentPage === 0}
                onClick={() => setAddedPage((p) => Math.max(0, p - 1))}
              >
                ‹
              </button>
              <span>
                {addedCurrentPage + 1} / {addedPageCount}
                <span className="aoi-pager__count"> · {addedCount}</span>
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={addedCurrentPage >= addedPageCount - 1}
                onClick={() => setAddedPage((p) => Math.min(addedPageCount - 1, p + 1))}
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* Saved AOIs from the DB, paginated. */}
      {aoi.libraryOpen && (
        <div className="aoi-section">
          <div className="aoi-section__label">Library</div>
          {libCount === 0 ? (
            <div className="aoi-empty">No saved AOIs yet.</div>
          ) : (
            <>
              <input
                className="aoi-search"
                type="text"
                value={libQuery}
                onChange={(event) => {
                  setLibQuery(event.target.value);
                  setLibPage(0);
                }}
                placeholder="Search AOIs"
                aria-label="Search AOIs"
              />
              {libFiltered.length === 0 ? (
                <div className="aoi-empty">No matching AOIs.</div>
              ) : (
                <div className="aoi-list">{libPageItems.map((item) => renderRow(item, false))}</div>
              )}
              {libPageCount > 1 && (
                <div className="aoi-pager">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={libCurrentPage === 0}
                    onClick={() => setLibPage((p) => Math.max(0, p - 1))}
                  >
                    ‹
                  </button>
                  <span>
                    {libCurrentPage + 1} / {libPageCount}
                    <span className="aoi-pager__count"> · {libFiltered.length}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={libCurrentPage >= libPageCount - 1}
                    onClick={() => setLibPage((p) => Math.min(libPageCount - 1, p + 1))}
                  >
                    ›
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {pendingDelete &&
        createPortal(
          <div className="confirm-dialog__overlay" onClick={() => setPendingDelete(null)}>
            <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="confirm-dialog__text">Delete AOI “{pendingDelete.name}”?</div>
              <div className="confirm-dialog__actions">
                <button
                  type="button"
                  className="confirm-dialog__cancel"
                  onClick={() => setPendingDelete(null)}
                >
                  Cancel
                </button>
                <button type="button" className="confirm-dialog__delete" onClick={confirmDelete}>
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
