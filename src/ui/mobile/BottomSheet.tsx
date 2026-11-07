// A draggable bottom sheet with three snap points (peek / half / full), velocity-aware snapping and haptics.
import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '../shared/ui-store';

export type Snap = 'peek' | 'half' | 'full';

export function BottomSheet({ snap, onSnap, bottomOffset, header, children, onHeightChange, page }: {
  snap: Snap; onSnap: (s: Snap) => void; bottomOffset: number; page?: string;
  header: ReactNode; children: ReactNode; onHeightChange?: (visiblePx: number) => void;
}) {
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => { const r = () => setVh(window.innerHeight); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const safeTop = 44;
  const heights: Record<Snap, number> = { peek: 132, half: Math.round(vh * 0.5), full: vh - safeTop - bottomOffset };
  const full = heights.full;
  const [drag, setDrag] = useState<number | null>(null);   // visible height while dragging
  const start = useRef<{ y: number; h: number; t: number; lastY: number; lastT: number } | null>(null);
  const visible = drag ?? heights[snap];
  const grabRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // a new page in the sheet (tab, place, day…) always starts at the top
  useLayoutEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [page]);
  const [grabH, setGrabH] = useState(64);
  useLayoutEffect(() => { if (grabRef.current) setGrabH(grabRef.current.offsetHeight); });

  useLayoutEffect(() => { onHeightChange?.(visible + bottomOffset); }, [visible, bottomOffset]);

  const onDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, h: heights[snap], t: performance.now(), lastY: e.clientY, lastT: performance.now() };
    setDrag(heights[snap]);
  }, [snap, vh, bottomOffset]);
  const onMove = useCallback((e: React.PointerEvent) => {
    if (!start.current) return;
    const h = Math.max(70, Math.min(full, start.current.h + (start.current.y - e.clientY)));
    start.current.lastY = e.clientY; start.current.lastT = performance.now();
    setDrag(h);
  }, [full]);
  const onUp = useCallback((e: React.PointerEvent) => {
    const st = start.current; start.current = null;
    if (!st) return;
    const moved = Math.abs(e.clientY - st.y);
    const h = drag ?? heights[snap];
    setDrag(null);
    if (moved < 6) { onSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half'); haptic(); return; } // tap on handle
    const v = (st.lastY - e.clientY) / Math.max(1, performance.now() - st.t) * 1000; // px/s, up = positive
    const order: Snap[] = ['peek', 'half', 'full'];
    let target: Snap;
    if (Math.abs(v) > 600) {
      const cur = order.indexOf(snap);
      target = order[Math.max(0, Math.min(2, cur + (v > 0 ? 1 : -1)))];
    } else target = order.reduce((best, s) => (Math.abs(heights[s] - h) < Math.abs(heights[best] - h) ? s : best), 'peek' as Snap);
    if (target !== snap) haptic();
    onSnap(target);
  }, [drag, snap, vh, bottomOffset]);

  return (
    <div className={'m-sheet' + (drag !== null ? ' dragging' : '') + ' snap-' + snap}
      style={{ height: full, bottom: bottomOffset, transform: `translateY(${full - visible}px)` }}>
      <div className="m-sheet-grab" ref={grabRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="m-handle"><span /></div>
        {header}
      </div>
      <div className="m-sheet-body" ref={bodyRef} style={{ height: Math.max(0, visible - grabH) }}>{children}</div>
    </div>
  );
}
