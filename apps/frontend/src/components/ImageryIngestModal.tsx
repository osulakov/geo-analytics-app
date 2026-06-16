import { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';
import { uploadImage } from '../data_loaders/media';

/** Modal form for ingesting an image (file + satellite name + WKT + timestamp)
 *  into the media bucket. Refreshes the shared imagery store on success. */
export const ImageryIngestModal = observer(function ImageryIngestModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { imagery } = useStores();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [satName, setSatName] = useState('');
  const [wkt, setWkt] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Swap in a fresh object-URL preview for the chosen file, revoking the old one.
  const pickFile = (next: File | null) => {
    setFile(next);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next ? URL.createObjectURL(next) : null;
    });
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const meta = await uploadImage(file, satName, wkt, timestamp);
      setMsg(`Saved ${meta.filename}`);
      pickFile(null);
      setSatName('');
      setWkt('');
      setTimestamp('');
      if (fileRef.current) fileRef.current.value = '';
      void imagery.load();
    } catch (error) {
      console.error('Image upload failed:', error);
      setMsg('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="vessel-modal__overlay" onClick={onClose}>
      <div
        className="vessel-modal imagery-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="vessel-modal__x" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="vessel-modal__title">Ingest imagery</div>

        <div className="mock-writer">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="imagery__file"
            aria-label="Image file"
            onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
          />
          {preview && (
            <img className="imagery__preview" src={preview} alt="Selected image preview" />
          )}
          <input
            type="text"
            className="mock-writer__select"
            placeholder="Satellite name"
            value={satName}
            onChange={(event) => setSatName(event.target.value)}
            aria-label="Satellite name"
          />
          <input
            type="text"
            className="mock-writer__select"
            placeholder="WKT (POLYGON((…)))"
            value={wkt}
            onChange={(event) => setWkt(event.target.value)}
            aria-label="Image WKT"
          />
          <input
            type="datetime-local"
            className="mock-writer__select"
            value={timestamp}
            onChange={(event) => setTimestamp(event.target.value)}
            aria-label="Capture timestamp"
          />
          <button
            type="button"
            className="mock-writer__create"
            disabled={!file || uploading}
            onClick={handleUpload}
          >
            {uploading ? 'Uploading…' : 'Upload to media bucket'}
          </button>
          {msg && <div className="mock-writer__hint">{msg}</div>}
        </div>
      </div>
    </div>
  );
});
