import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { useI18n } from '../i18n';

export default function PhotoUpload({ photoURL, onUpload, onRemove }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-mist border border-dashed border-indigo/30 flex items-center justify-center">
      {photoURL ? (
        <>
          <img src={photoURL} alt="" className="w-full h-full object-cover" />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute top-2 right-2 bg-ink/60 text-porcelain rounded-full p-2.5"
              aria-label={t('recipe.removeMainPhoto')}
            >
              <X size={16} />
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center gap-2 text-indigo/70 text-sm"
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Camera size={28} />}
          {uploading ? t('recipe.uploading') : t('recipe.photoPrompt')}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      {photoURL && !uploading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute bottom-2 right-2 bg-porcelain/90 text-ink text-xs px-3 py-2 rounded-md shadow-card"
        >
          {t('recipe.changePhoto')}
        </button>
      )}
    </div>
  );
}
