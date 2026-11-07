// A draggable bottom sheet with three snap points (peek / half / full), velocity-aware snapping and haptics.
// Like Apple Maps: below full height the whole sheet drags (handle *and* content); at full height the content
// scrolls, and pulling down while it is scrolled to the top drags the sheet down instead of bouncing.
import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '../shared/ui-store';

export type Snap = 'peek' | 'half' | 'full';
const ORDER: Snap[] = ['peek', 'half', 'full'];

export function BottomSheet({ snap, onSnap, bottomOffset, header, children, onHeightChange, page }: {
  snap: Snap; onSnap: (s: Snap) => void; bottomOffset: number; page?: string;
  header: ReactNode; children: ReactNode; onHeightChange?: (visiblePx: number) => void;
}) {
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => { const r = () => setVh(window.innerHeight); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const safeTop = 44;
  const heights: Record<Snap, number> = { peek: 132, half: Math.round(vh * 0.5), full: vh - safeTop - bottomOffset };
  const [drag, setDrag] = useState<number | null>(null);   // visible height while dragging
  const visible = drag ?? heights[snap];
  const grabRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [grabH, setGrabH] = useState(64);
  useLayoutEffect(() => { if (grabRef.current) setGrabH(grabRef.current.offsetHeight); });
  // a new page in the sheet (tab, place, day…) always starts at the top
  useLayoutEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [page]);
  useLayoutEffect(() => { onHeightChange?.(visible + bottomOffset); }, [visible, bottomOffset]);

  // latest values for the (native) gesture handlers
  const live = useRef({ snap, heights, onSnap });
  live.current = { snap, heights, onSnap };

  // ── shared drag engine ──
  const g = useRef<{ y0: number; h0: number; h: number; samples: { y: number; t: number }[] } | null>(null);
  const begin = (y: number) => {
    const h0 = live.current.heights[live.current.snap];
    g.current = { y0: y, h0, h: h0, samples: [{ y, t: performance.now() }] };
    setDrag(h0);
  };
  const move = (y: number) => {
    const s = g.current; if (!s) return;
    const max = live.current.heights.full;
    let h = s.h0 + (s.y0 - y);
    if (h > max) h = max + (h - max) * 0.2;   // rubber band past full / below peek
    if (h < 90) h = 90 - (90 - h) * 0.3;
    s.h = h;
    s.samples.push({ y, t: performance.now() }); if (s.samples.length > 6) s.samples.shift();
    setDrag(h);
  };
  const end = (tap = false) => {
    const s = g.current; g.current = null;
    setDrag(null);
    if (!s) return;
    const { snap: cur, heights: H, onSnap: go } = live.current;
    if (tap) { go(cur === 'peek' ? 'half' : cur === 'half' ? 'full' : 'half'); haptic(); return; }
    const a = s.samples[0], b = s.samples[s.samples.length - 1];
    const v = (a.y - b.y) / Math.max(1, b.t - a.t) * 1000; // px/s, up = positive
    let target: Snap;
    if (Math.abs(v) > 500) {
      // a flick moves one step from where the finger is now (a hard flick from full can reach peek)
      const near = ORDER.reduce((best, x) => (Math.abs(H[x] - s.h) < Math.abs(H[best] - s.h) ? x : best), cur);
      const i = ORDER.indexOf(near);
      target = v > 0 ? ORDER[Math.min(2, Math.max(i, ORDER.indexOf(cur) + 1))] : ORDER[Math.max(0, Math.min(i, ORDER.indexOf(cur) - 1))];
    } else target = ORDER.reduce((best, x) => (Math.abs(H[x] - s.h) < Math.abs(H[best] - s.h) ? x : best), 'peek' as Snap);
    if (target !== cur) haptic();
    go(target);
  };

  // ── handle / header: mouse + touch via pointer events ──
  const down = useRef<{ y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    down.current = { y: e.clientY }; begin(e.clientY);
  };
  const onMove = (e: React.PointerEvent) => { if (down.current) move(e.clientY); };
  const onUp = (e: React.PointerEvent) => {
    if (!down.current) return;
    const tap = Math.abs(e.clientY - down.current.y) < 6; down.current = null; end(tap);
  };

  // ── content: native touch listeners so we can take over from scrolling (needs passive: false) ──
  useEffect(() => {
    const el = bodyRef.current!;
    let t: { x: number; y: number; mode: 'undecided' | 'sheet' | 'scroll' } | null = null;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { t = null; return; }
      t = { x: e.touches[0].clientX, y: e.touches[0].clientY, mode: 'undecided' };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!t) return;
      const p = e.touches[0];
      const dx = p.clientX - t.x, dy = p.clientY - t.y;
      if (t.mode === 'undecided') {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dx) > Math.abs(dy)) { t.mode = 'scroll'; return; }        // horizontal: leave it (swipe-back, sliders)
        const isFull = live.current.snap === 'full';
        // below full height the sheet moves; at full height only a pull-down from the very top moves it
        t.mode = !isFull || (dy > 0 && el.scrollTop <= 0) ? 'sheet' : 'scroll';
        if (t.mode === 'sheet') begin(t.y);
      }
      if (t.mode === 'sheet') { e.preventDefault(); move(p.clientY); }
    };
    const onEnd = () => { if (t?.mode === 'sheet') end(false); t = null; };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onEnd); el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const notFull = snap !== 'full' || drag !== null;
  return (
    <div className={'m-sheet' + (drag !== null ? ' dragging' : '') + ' snap-' + snap}
      style={{ height: heights.full, bottom: bottomOffset, transform: `translateY(${heights.full - Math.min(visible, heights.full)}px)` }}>
      <div className="m-sheet-grab" ref={grabRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="m-handle"><span /></div>
        {header}
      </div>
      <div className={'m-sheet-body' + (notFull ? ' locked' : '')} ref={bodyRef} style={{ height: Math.max(0, Math.min(visible, heights.full) - grabH) }}>{children}</div>
    </div>
  );
}
