import { useRef, useState } from 'react';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { useI18n } from '../i18n';

// 可拖动排序的列表。用 Pointer Events 而不是 HTML5 的 drag-and-drop：
// 后者在手机上根本不触发，而这个应用主要是在厨房里用手机看的。
//
// 拖动逻辑刻意做得很简单：手指越过相邻那一项的中线就立刻交换，
// 不做占位符动画。列表只有几项，这样最稳，也不用引入拖拽库。
//
// 同时保留上/下箭头按钮：键盘和读屏用户没法拖，而且精细拖动在小屏上很别扭。
export default function SortableList({ items, onReorder, renderItem, itemClassName = '' }) {
  const { t } = useI18n();
  const [dragIndex, setDragIndex] = useState(null);
  const rowRefs = useRef([]);
  // 拖动过程中的实时顺序：交换发生在 pointermove 里，松手才算最终结果
  const orderRef = useRef(null);

  function move(from, to) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  }

  function handlePointerDown(index, event) {
    // 只认主键/单指，右键和多指手势不该触发拖动
    if (event.button != null && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    orderRef.current = index;
    setDragIndex(index);
  }

  function handlePointerMove(event) {
    if (orderRef.current == null) return;
    const current = orderRef.current;
    const y = event.clientY;

    // 越过上一项的中线就往上挪，越过下一项的中线就往下挪
    const prev = rowRefs.current[current - 1];
    const next = rowRefs.current[current + 1];
    if (prev) {
      const box = prev.getBoundingClientRect();
      if (y < box.top + box.height / 2) {
        move(current, current - 1);
        orderRef.current = current - 1;
        setDragIndex(current - 1);
        return;
      }
    }
    if (next) {
      const box = next.getBoundingClientRect();
      if (y > box.top + box.height / 2) {
        move(current, current + 1);
        orderRef.current = current + 1;
        setDragIndex(current + 1);
      }
    }
  }

  function handlePointerUp() {
    orderRef.current = null;
    setDragIndex(null);
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={item.id}
          ref={(el) => {
            rowRefs.current[index] = el;
          }}
          className={`flex gap-2 ${itemClassName} ${
            dragIndex === index ? 'opacity-70 ring-2 ring-indigo rounded-lg' : ''
          }`}
        >
          {/* 控件竖条。以前这一列用的是 text-ink/25 —— 16px 的图标淡成一片灰，
              基本等于看不见，用户根本发现不了能拖。所以给它一个浅底色框，
              让它一眼就是「可以抓的地方」。 */}
          <div className="flex flex-col items-center shrink-0 rounded-lg bg-mist/50 border border-mist py-1 px-0.5 self-start">
            {/* 拖动把手。touch-action:none 是必须的，否则手机上一拖就变成页面滚动 */}
            <button
              type="button"
              aria-label={t('sortable.drag')}
              title={t('sortable.drag')}
              onPointerDown={(e) => handlePointerDown(index, e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="p-1 text-ink/50 active:text-indigo cursor-grab touch-none"
              style={{ touchAction: 'none' }}
            >
              <GripVertical size={18} />
            </button>
            {/* 键盘 / 读屏 / 小屏微调用的备选路径。
                点击区域按手指尺寸给（py-1.5 + px-1.5），不然手机上很难点中。 */}
            <button
              type="button"
              aria-label={t('sortable.up')}
              title={t('sortable.up')}
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
              className="text-ink/50 disabled:opacity-25 py-1.5 px-1.5 active:text-indigo"
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              aria-label={t('sortable.down')}
              title={t('sortable.down')}
              disabled={index === items.length - 1}
              onClick={() => move(index, index + 1)}
              className="text-ink/50 disabled:opacity-25 py-1.5 px-1.5 active:text-indigo"
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="flex-1 min-w-0">{renderItem(item, index)}</div>
        </div>
      ))}
    </div>
  );
}
