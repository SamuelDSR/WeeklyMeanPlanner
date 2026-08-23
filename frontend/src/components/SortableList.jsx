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
  // 一次拖动的全部状态。按下时快照一份，松手清空。
  //
  // 为什么要快照：早先的做法是「手指越过相邻一行的中线就跟它换位置」，
  // 但换完位置之后整个列表的布局就变了 —— 被拖的那行跑到了新位置，
  // 参照物也跟着动，于是往下拖会少走一格（往上拖却是对的，很难察觉）。
  // 现在改成：按下时记住各行中线和原始顺序，之后每次都拿指针位置直接算出
  // 「应该落在第几位」，再从原始顺序重排一次。不累积误差，上下都准。
  //
  // 还要记一个 grabOffset：把手是贴着卡片顶部的（self-start），而卡片挺高，
  // 所以按下的那一刻指针离这一行的中线差着几十像素。不修正的话，
  // 得往下拖出一行多的距离才会发生第一次换位，手感很迟钝、还会少走一格。
  // 修正之后是 1:1 的：拖过一行的高度，就正好挪一位。
  const drag = useRef(null);

  function reorderTo(target) {
    const st = drag.current;
    if (!st || target === st.currentIndex) return;
    const next = [...st.baseline];
    const [moved] = next.splice(st.fromIndex, 1);
    next.splice(target, 0, moved);
    st.currentIndex = target;
    setDragIndex(target);
    onReorder(next);
  }

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
    // 各行中线（视口坐标）。拖动过程里不再重新测量，避免参照物跟着动。
    const centers = rowRefs.current
      .filter(Boolean)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });
    drag.current = {
      fromIndex: index,
      currentIndex: index,
      centers,
      // 指针相对「这一行中线」的偏移，后面用它把指针换算成行的位置
      grabOffset: event.clientY - (centers[index] ?? event.clientY),
      baseline: items,
    };
    setDragIndex(index);
  }

  function handlePointerMove(event) {
    const st = drag.current;
    if (!st) return;
    const { centers, fromIndex, grabOffset } = st;
    // 减掉抓取偏移 —— 比的是「这一行现在的中线在哪」，不是指尖在哪
    const y = event.clientY - grabOffset;

    // 指针现在越过了哪些行的中线 -> 该落在第几位
    let target = fromIndex;
    for (let i = 0; i < centers.length; i += 1) {
      if (i < fromIndex && y < centers[i]) {
        target = i; // 往上：第一个中线在指针下方的行
        break;
      }
      if (i > fromIndex && y > centers[i]) {
        target = i; // 往下：最后一个中线在指针上方的行
      }
    }
    reorderTo(target);
  }

  function handlePointerUp() {
    drag.current = null;
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
