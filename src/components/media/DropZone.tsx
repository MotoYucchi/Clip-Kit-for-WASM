import { useRef, useState } from 'react';
import { FILE_INPUT_ACCEPT } from '../../config/formats';
import { translate } from '../../i18n';
import { useUiStore } from '../../store/useUiStore';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
}

export function DropZone({ onFileSelected }: DropZoneProps) {
  const { lang } = useUiStore();
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onFileSelected(files[0]);
  };

  return (
    <section
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={t('drop.selectBtn')}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="dropzone-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>

      <h2 className="dropzone-title">{t('drop.title')}</h2>
      <p className="dropzone-sub">{t('drop.subtitle')}</p>

      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        {t('drop.selectBtn')}
      </button>

      <p className="field-hint">{t('drop.privacyNote')}</p>
      <p className="field-hint">{t('drop.supportedNote')}</p>
    </section>
  );
}
