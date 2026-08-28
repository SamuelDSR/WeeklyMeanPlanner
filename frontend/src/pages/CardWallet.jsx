import { lazy, Suspense, useEffect, useState } from 'react';
import { CreditCard, Plus, Trash2, Pencil, X, Camera, Loader2, ScanLine } from 'lucide-react';
import {
  fetchCards, fetchCardMeta, createCard, updateCard, deleteCard,
} from '../lib/cardData';
import { uploadRecipePhoto } from '../lib/familyData';
import BarcodeView from '../components/BarcodeView';
import CardScanView from '../components/CardScanView';
// 扫码要拉 1 MB 的 wasm（只在没有原生 BarcodeDetector 的浏览器上），按需加载
const CardScanner = lazy(() => import('../components/CardScanner'));
import { useI18n } from '../i18n';

// 卡包：全家共享的会员卡。点一张就全屏放大给扫码枪看。
const COLOR_CLASS = {
  indigo: 'bg-indigo', wheat: 'bg-wheat', persimmon: 'bg-persimmon',
  matcha: 'bg-matcha', ink: 'bg-ink',
};

const emptyDraft = () => ({
  name: '', code: '', codeFormat: 'CODE128', note: '', color: 'indigo',
  photoURL: null, thumbURL: null,
});

export default function CardWallet() {
  const { t } = useI18n();
  const [cards, setCards] = useState(undefined);
  const [meta, setMeta] = useState({ formats: [], colors: [] });
  const [scanning, setScanning] = useState(null); // 正在全屏展示的卡
  const [editing, setEditing] = useState(null); // { id? , ...draft }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scanning2, setScanning2] = useState(false); // 相机扫码面板

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCards(), fetchCardMeta()])
      .then(([list, m]) => {
        if (cancelled) return;
        setCards(list);
        setMeta(m);
      })
      .catch((e) => {
        if (!cancelled) {
          setCards([]);
          setError(e.message || t('common.loadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    setCards(await fetchCards());
  }

  async function handleSave() {
    setError('');
    setBusy(true);
    try {
      const { id, ...data } = editing;
      if (id) await updateCard(id, data);
      else await createCard(data);
      await reload();
      setEditing(null);
    } catch (e) {
      setError(e.message || t('common.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(card) {
    if (!window.confirm(t('cards.deleteConfirm', { name: card.name }))) return;
    setError('');
    try {
      await deleteCard(card.id);
      await reload();
    } catch (e) {
      setError(e.message || t('common.actionFailed'));
    }
  }

  // 实拍照片走和菜品照片同一个上传接口（一样会压成主图+缩略图）
  async function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { photoURL, thumbURL } = await uploadRecipePhoto(file);
      setEditing((d) => ({ ...d, photoURL, thumbURL }));
    } catch (e) {
      setError(e.message || t('cards.photoFailed'));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  if (scanning) {
    return <CardScanView card={scanning} onClose={() => setScanning(null)} />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-bold text-xl flex items-center gap-2">
          <CreditCard size={19} className="text-indigo" /> {t('cards.title')}
        </h2>
        <button
          onClick={() => setEditing(emptyDraft())}
          className="text-sm text-indigo flex items-center gap-1 px-2 py-1.5 -mr-2"
        >
          <Plus size={16} /> {t('cards.add')}
        </button>
      </div>
      <p className="text-xs text-ink/45 mb-4">{t('cards.intro')}</p>

      {error && <p className="text-persimmon text-sm mb-3">{error}</p>}

      {cards === undefined ? (
        <p className="text-center text-ink/40 text-sm mt-6">{t('common.loading')}</p>
      ) : cards.length === 0 ? (
        <p className="text-center text-ink/40 text-sm mt-8">{t('cards.empty')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => (
            <div key={card.id} className="bg-white rounded-xl shadow-card overflow-hidden">
              {/* 点卡面就全屏 —— 结账时要一步到位 */}
              <button
                type="button"
                onClick={() => setScanning(card)}
                className="w-full text-left"
              >
                <div className={`${COLOR_CLASS[card.color] || 'bg-indigo'} h-16 flex items-end p-2.5`}>
                  <span className="text-white font-display font-bold text-sm truncate drop-shadow">
                    {card.name}
                  </span>
                </div>
                <div className="px-2.5 py-2 bg-white">
                  {/* 卡面上放一个小号的码，认起来快 */}
                  <div className="h-10 overflow-hidden flex items-center justify-center">
                    <BarcodeView
                      code={card.code}
                      format={card.codeFormat}
                      height={30}
                      displayValue={false}
                    />
                  </div>
                  <p className="font-mono text-[10px] text-ink/40 truncate mt-1">{card.code}</p>
                </div>
              </button>
              <div className="flex border-t border-mist">
                <button
                  onClick={() => setEditing({ ...card })}
                  className="flex-1 py-2 text-ink/40 flex justify-center"
                  aria-label={t('common.edit')}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(card)}
                  className="flex-1 py-2 text-ink/40 flex justify-center border-l border-mist"
                  aria-label={t('common.delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 相机扫码。扫到就把码和格式一起填回表单 —— 格式也是扫出来的，
          用户不用再去猜这张卡是 EAN-13 还是 Code 128。 */}
      {scanning2 && (
        <Suspense fallback={null}>
          <CardScanner
            onClose={() => setScanning2(false)}
            onDetected={({ code, format }) => {
              setEditing((d) => ({ ...(d || emptyDraft()), code, codeFormat: format }));
              setScanning2(false);
            }}
          />
        </Suspense>
      )}

      {/* 新增 / 编辑 */}
      {editing && (
        <div className="fixed inset-0 z-40 bg-ink/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-porcelain w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto pb-safe">
            <div className="flex items-center justify-between px-4 py-3 border-b border-mist sticky top-0 bg-porcelain">
              <h3 className="font-display font-semibold">
                {editing.id ? t('cards.editTitle') : t('cards.newTitle')}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1.5 text-ink/40">
                <X size={20} />
              </button>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="text-sm text-ink/60 block mb-1">{t('cards.name')}</label>
                <input
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder={t('cards.namePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-mist bg-white outline-none"
                />
              </div>

              <div>
                <label className="text-sm text-ink/60 block mb-1">{t('cards.format')}</label>
                <select
                  value={editing.codeFormat}
                  onChange={(e) => setEditing({ ...editing, codeFormat: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-mist bg-white outline-none"
                >
                  {meta.formats.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                      {f.digits ? ` (${f.digits} 位)` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-ink/40 mt-1">{t('cards.formatHint')}</p>
              </div>

              <div>
                <label className="text-sm text-ink/60 block mb-1">{t('cards.code')}</label>
                <div className="flex gap-2">
                  <input
                    value={editing.code}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                    placeholder={t('cards.codePlaceholder')}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-mist bg-white font-mono outline-none"
                  />
                  {/* 对着卡扫一下比照着 13 位数字手输可靠得多 */}
                  <button
                    type="button"
                    onClick={() => setScanning2(true)}
                    className="shrink-0 px-3 rounded-lg bg-indigo text-porcelain flex items-center gap-1.5 text-sm font-medium"
                  >
                    <ScanLine size={16} /> {t('scan.action')}
                  </button>
                </div>
              </div>

              {/* 边填边看：码画不出来当场就知道，不用等保存 */}
              {editing.code.trim() && (
                <div className="bg-white rounded-lg border border-mist p-2">
                  <BarcodeView code={editing.code.trim()} format={editing.codeFormat} height={60} />
                </div>
              )}

              <div>
                <label className="text-sm text-ink/60 block mb-1">{t('cards.color')}</label>
                <div className="flex gap-2">
                  {meta.colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditing({ ...editing, color: c })}
                      aria-label={c}
                      className={`w-8 h-8 rounded-full ${COLOR_CLASS[c]} ${
                        editing.color === c ? 'ring-2 ring-offset-2 ring-ink/40' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm text-ink/60 block mb-1">{t('cards.note')}</label>
                <input
                  value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  placeholder={t('cards.notePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-mist bg-white outline-none"
                />
              </div>

              {/* 实拍照片：码印糊了扫不出来时的退路 */}
              <div>
                <label className="text-sm text-ink/60 block mb-1">{t('cards.photo')}</label>
                {editing.photoURL ? (
                  <div className="relative w-32">
                    <img
                      src={editing.thumbURL || editing.photoURL}
                      alt=""
                      className="w-32 h-20 object-cover rounded-md border border-mist"
                    />
                    <button
                      type="button"
                      onClick={() => setEditing({ ...editing, photoURL: null, thumbURL: null })}
                      className="absolute -top-1.5 -right-1.5 bg-ink/60 text-porcelain rounded-full p-0.5"
                      aria-label={t('recipe.removePhoto')}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-1 text-xs text-indigo cursor-pointer">
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                    {uploading ? t('recipe.uploading') : t('cards.addPhoto')}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                  </label>
                )}
                <p className="text-[11px] text-ink/40 mt-1">{t('cards.photoHint')}</p>
              </div>

              {error && <p className="text-persimmon text-sm">{error}</p>}
            </div>

            <div className="px-4 py-3 border-t border-mist sticky bottom-0 bg-porcelain">
              <button
                onClick={handleSave}
                disabled={busy || !editing.name.trim() || !editing.code.trim()}
                className="w-full py-2.5 rounded-lg bg-indigo text-porcelain font-medium disabled:opacity-40"
              >
                {busy ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
