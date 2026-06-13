import GestureIcon from '@mui/icons-material/Gesture';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CodeIcon from '@mui/icons-material/Code';

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

/**
 * Areas of Interest widget: entry points for defining an AOI. All four options
 * are placeholders for now (no behaviour wired up yet).
 */
export function AoisWidget() {
  return (
    <div className="aois-widget">
      <div className="aois-widget__title">AOIs</div>
      <div className="aois-widget__options">
        {OPTIONS.map(({ id, label, Icon }) => (
          <button key={id} type="button" className="aoi-option">
            <Icon fontSize="inherit" className="aoi-option__icon" />
            <span className="aoi-option__label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
