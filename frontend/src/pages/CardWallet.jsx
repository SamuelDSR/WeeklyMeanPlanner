import { lazy, Suspense, useEffect, useState } from 'react';
import { CreditCard, Plus, Trash2, Pencil, X, Camera, Loader2, ScanLine, CloudOff } from 'lucide-react';
import {
  fetchCards, fetchCardMeta, createCard, updateCard, deleteCard,
} from '../lib/cardData';
import { uploadRecipePhoto } from '../lib/familyData';
import { readCache, writeCache, cacheMeta, isNetworkError } from '../lib/localCache';
import BarcodeView from '../components/BarcodeView';
import CardScanView from '../components/CardScanView';
import BrandPicker from '../components/BrandPicker';
import BrandLogo from '../components/BrandLogo';
// 扫码要拉 1 MB 的 wasm（只在没有原生 BarcodeDetector 的浏览器上），按需加载
const CardScanner = lazy(() => import('../components/CardScanner'));
import { useI18n } from '../i18n';

// 卡包：全家共享的会员卡。点一张就全屏放大给扫码枪看。
const COLOR_CLASS = {
  indigo: 'bg-indigo', wheat: 'bg-wheat', persimmon: 'bg-persimmon',
  matcha: 'bg-matcha', ink: 'bg-ink',
};

// 「上次同步」显示成粗略的相对时间。用 Intl 而不是自己拼字符串 ——
// 三种语言的说法各不相同，硬编码中文会漏在界面上。
function formatSavedAt(meta, locale) {
  if (!meta?.savedAt) return '';
  const rtf = new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : locale, { numeric: 'auto' });
  const mins = Math.round((meta.savedAt - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return rtf.format(Math.min(-1, mins), 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

const emptyDraft = () => ({
  name: '', code: '', codeFormat: 'CODE128', note: '', color: 'indigo', brand: null,
  photoURL: null, thumbURL: null,
});

// 和 BrandLogo 里的判断保持一致：浅色底配黑字
function isLightHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
}

export default function CardWallet() {
  const { t, locale } = useI18n();
  const [cards, setCards] = useState(undefined);
  const [meta, setMeta] = useState({ formats: [], colors: [] });
  const [scanning, setScanning] = useState(null); // 正在全屏展示的卡
  const [editing, setEditing] = useState(null); // { id? , ...draft }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stale, setStale] = useState(false); // 正在用本地缓存撑着
  const [scanning2, setScanning2] = useState(false); // 相机扫码面板
  const [picking, setPicking] = useState(false);     // 选商家
  // 「点商家 -> 直接扫 -> 存好」这条快捷路径上，当前选的是哪个商家
  const [quickBrand, setQuickBrand] = useState(null);
  const [savingQuick, setSavingQuick] = useState(false);

  // 会员卡是「站在收银台前必须立刻打开」的东西，所以不等网络：
  // 先把上次存的那份画出来，再去后台刷新。NetworkFirst 断网要等 3 秒超时，
  // 排队的人可等不了。
  useEffect(() => {
    const cached = readCache('cards');
    if (cached) setCards(cached);
    const cachedMeta = readCache('card-meta');
    if (cachedMeta) setMeta(cachedMeta);

    let cancelled = false;
    Promise.all([fetchCards(), fetchCardMeta()])
      .then(([list, m]) => {
        if (cancelled) return;
        setCards(list);
        setMeta(m);
        writeCache('cards', list);
        writeCache('card-meta', m);
        setStale(false);
      })
      .catch((e) => {
        if (cancelled) return;
        // 断网但本地有存货：照常用，只是标一下「这是上次同步的」
        if (isNetworkError(e) && readCache('cards')) {
          setStale(true);
          return;
        }
        if (!readCache('cards')) setCards([]);
        setError(e.message || t('common.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 卡上记着商家 slug，名字/颜色都从 meta 里查（改配色不用动数据库）
  function brandOf(card) {
    return card.brand ? (meta.brands || []).find((b) => b.slug === card.brand) || null : null;
  }

  async function reload() {
    const list = await fetchCards();
    setCards(list);
    writeCache('cards', list);
    setStale(false);
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
          onClick={() => setPicking(true)}
          className="text-sm text-indigo flex items-center gap-1 px-2 py-1.5 -mr-2"
        >
          <Plus size={16} /> {t('cards.add')}
        </button>
      </div>
      <p className="text-xs text-ink/45 mb-2">{t('cards.intro')}</p>
      {/* 离线时明说这是上次同步的数据 —— 卡号不会变，所以照用无妨，但得让人知道 */}
      {stale && (
        <p className="text-[11px] text-wheat mb-3 flex items-center gap-1">
          <CloudOff size={11} /> {t('cards.staleNotice', { when: formatSavedAt(cacheMeta('cards'), locale) })}
        </p>
      )}

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
                {/* 认识的商家用品牌色，自己加的卡用调色板颜色 */}
                {brandOf(card) ? (
                  <div
                    className="h-16 flex items-center gap-2 px-2.5"
                    style={{ background: brandOf(card).color }}
                  >
                    <BrandLogo brand={brandOf(card)} size={30} className="bg-white/25" />
                    <span
                      className="font-display font-bold text-sm truncate drop-shadow"
                      style={{ color: isLightHex(brandOf(card).color) ? '#22302B' : '#fff' }}
                    >
                      {card.name}
                    </span>
                  </div>
                ) : (
                  <div className={`${COLOR_CLASS[card.color] || 'bg-indigo'} h-16 flex items-end p-2.5`}>
                    <span className="text-white font-display font-bold text-sm truncate drop-shadow">
                      {card.name}
                    </span>
                  </div>
                )}
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

      {/* 第一步：选商家。点一下就直接开相机。 */}
      {picking && (
        <BrandPicker
          brands={meta.brands || []}
          onClose={() => setPicking(false)}
          onPick={(brand) => {
            setQuickBrand(brand);
            setPicking(false);
            setScanning2(true);
          }}
          onCustom={() => {
            setPicking(false);
            setQuickBrand(null);
            setEditing(emptyDraft());
          }}
        />
      )}

      {/* 相机扫码。
          从商家进来的：扫到就**直接存**，一步都不用再点 —— 名字、颜色、
          码制全都是现成的，再弹个表单让人按「保存」纯属多此一举。
          从编辑表单进来的：只把码填回表单，用户还要接着改别的。 */}
      {scanning2 && (
        <Suspense fallback={null}>
          <CardScanner
            onClose={() => {
              setScanning2(false);
              // 从商家进来的没扫成，退到预填好的表单，别让人白点一趟
              if (quickBrand) {
                setEditing({ ...emptyDraft(), name: quickBrand.name, brand: quickBrand.slug,
                             codeFormat: quickBrand.format });
                setQuickBrand(null);
              }
            }}
            onDetected={async ({ code, format }) => {
              if (!quickBrand) {
                setEditing((d) => ({ ...(d || emptyDraft()), code, codeFormat: format }));
                setScanning2(false);
                return;
              }
              setSavingQuick(true);
              try {
                await createCard({
                  name: quickBrand.name,
                  brand: quickBrand.slug,
                  code,
                  codeFormat: format,
                  color: 'indigo',
                });
                await reload();
                setScanning2(false);
                setQuickBrand(null);
              } catch (e) {
                // 存不下（码校验不过、离线）就退到表单，扫到的东西不能白丢
                setScanning2(false);
                setEditing({ ...emptyDraft(), name: quickBrand.name, brand: quickBrand.slug,
                             code, codeFormat: format });
                setQuickBrand(null);
                setError(e.message || t('common.saveFailed'));
              } finally {
                setSavingQuick(false);
              }
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
