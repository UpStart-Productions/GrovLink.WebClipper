import { useRef, useState } from 'react';
import { normalizePhotoFile } from '../../lib/api';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

function pickImageFile(file: File | undefined): File | null {
  if (!file) return null;
  try {
    return normalizePhotoFile(file);
  } catch {
    return null;
  }
}

export default function PhotoDropZone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  function accept(file: File | undefined) {
    setError('');
    if (!file) return;
    const normalized = pickImageFile(file);
    if (!normalized) {
      setError('Use a PNG, JPEG, GIF, or WebP image.');
      return;
    }
    onFile(normalized);
  }

  return (
    <div>
      <div
        className={`photo-drop-zone${dragOver ? ' photo-drop-zone--active' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          accept(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Add photo by drag and drop or browse"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="photo-drop-zone-title">Drop an image here</p>
        <p className="photo-drop-zone-sub">or click to browse · PNG, JPEG, GIF, WebP</p>
      </div>
      {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
