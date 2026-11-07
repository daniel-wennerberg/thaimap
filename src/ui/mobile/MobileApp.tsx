// Mobile shell: full-screen map, compact title, tool column, a draggable bottom sheet and a native-style tab bar.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LANG, T, store } from '../../core';
import { ui, setUI, useApp, haptic } from '../shared/ui-store';
import { useMapController, hudData } from '../shared/useMapController';
import {
  activeTrip, backToTimeline, fitFamily, getTab, locate, selectPlace, setLangPref, setTab, startMode, tripDayMode, type Tab,
} from '../shared/actions';
import { Toasts, ConnBanner } from '../shared/components/common';
import { SearchRow, CategoryChips, PlaceList, PlaceDetail } from '../shared/components/Explore';
import { TripBar, PlanTab } from '../shared/components/Plan';
import { FamilyCard, LiveCard, Feed, MeetupDetail, NoteDetail, DraftComposer, ModeBanner } from '../shared/components/Family';
import { TripForm, JoinForm } from '../shared/components/Forms';
import { BottomSheet, type Snap } from './BottomSheet';

const TABBAR = 64;

/** Full-screen modal sheet (slides up) for forms. */
function ModalSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="m-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="m-modal-card"><div className="m-handle"><span /></div>{children}</div>
    </div>
  );
}

/** Content pushed onto the sheet's stack slides in from the right; swiping from the left edge goes back. */
function Pushed({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const x0 = useRef<number | null>(null);
  return (
    <div className="m-pushed"
      onTouchStart={(e) => { const t = e.touches[0]; x0.current = t.clientX < 28 ? t.clientX : null; }}
      onTouchEnd={(e) => { if (x0.current !== null && e.changedTouches[0].clientX - x0.current > 80) { haptic(); onBack(); } x0.current = null; }}>
      {children}
    </div>
  );
}

export default function MobileApp() {
  useApp();
  const tab = getTab();
  const [snap, setSnapState] = useState<Snap>('half');
  const sheetH = useRef(window.innerHeight * 0.5 + TABBAR);
  // no top inset: the map runs edge to edge under the status bar and the floating title; only the toolbars use safe areas
  const insets = () => ({ l: 0, t: 0, r: 62, b: sheetH.current + 8 });
  const { ref: mapRef, ctl } = useMapController(insets, 'minimal');
  const setSnap = (s: Snap) => {
    const before = ctl?.currentInsets();
    setSnapState(s);
    if (before) setTimeout(() => ctl?.shiftForInsets(before), 260);
  };

  useEffect(() => {
    const urlFamily = new URLSearchParams(location.search).get('family');
    if ((urlFamily && urlFamily.toLowerCase() !== store.state.family) || !store.state.me) setTimeout(() => setUI({ dialog: 'join' }), 300);
    store.connect();
  }, []);

  // sheet follows what you're doing
  useEffect(() => { if (ui.mode) setSnap('peek'); }, [ui.mode]);
  useEffect(() => { if (ui.draft || ui.focus || ui.selected) setSnap(snap === 'full' ? 'full' : 'half'); }, [ui.draft, ui.focus, ui.selected]);
  // opening a day goes full screen; coming back to the timeline returns to half (if we were the ones who expanded it)
  const autoFull = useRef(false);
  useEffect(() => {
    if (tripDayMode()) { if (snap !== 'full') { autoFull.current = true; setSnap('full'); } }
    else if (autoFull.current) { autoFull.current = false; setSnap('half'); }
  }, [ui.view, store.state.activePlanId]);

  const goTab = (t: Tab) => {
    haptic();
    if (t === tab) { setSnap(snap === 'peek' ? 'half' : 'peek'); return; }
    setUI({ focus: null, draft: null });
    setTab(t);
    if (snap === 'peek') setSnap('half');
  };

  const hud = hudData();
  const unread = tab !== 'family' && store.hasUnread();
  const s = store.state;

  // ── what the sheet shows (a small navigation stack per tab) ──
  let header: ReactNode;
  let body: ReactNode;
  if (ui.draft) {
    header = null;
    body = <Pushed onBack={() => setUI({ draft: null })}><DraftComposer key={`${ui.draft.kind}${ui.draft.lat}${ui.draft.lng}`} /></Pushed>;
  } else if (ui.focus?.type === 'meetup' || ui.focus?.type === 'note') {
    const close = () => setUI({ focus: null });
    header = <div className="m-sheet-title"><button className="m-back" onClick={close}>‹ {T('Back')}</button></div>;
    body = <Pushed onBack={close}>{ui.focus.type === 'meetup' ? <MeetupDetail id={ui.focus.id} /> : <NoteDetail id={ui.focus.id} />}</Pushed>;
  } else if (tab === 'explore' && ui.selected) {
    const close = () => selectPlace(null);
    header = <div className="m-sheet-title"><button className="m-back" onClick={close}>‹ {T('Explore')}</button></div>;
    body = <Pushed key={ui.selected} onBack={close}><PlaceDetail id={ui.selected} /></Pushed>;
  } else if (tab === 'explore') {
    header = <div className="m-sheet-head"><SearchRow /></div>;
    body = <><CategoryChips /><PlaceList /></>;
  } else if (tab === 'plan') {
    const inDay = tripDayMode();
    header = inDay ? null : <div className="m-sheet-head"><TripBar onNewTrip={() => setUI({ dialog: 'trip' })} /></div>;
    body = inDay
      ? <Pushed key={s.activePlanId} onBack={backToTimeline}><PlanTab onNewTrip={() => setUI({ dialog: 'trip' })} onEditTrip={() => setUI({ dialog: 'trip-edit' })} /></Pushed>
      : <PlanTab onNewTrip={() => setUI({ dialog: 'trip' })} onEditTrip={() => setUI({ dialog: 'trip-edit' })} />;
  } else {
    header = <div className="m-sheet-title"><b>{s.family || T('Family')}</b>{s.family && <span className={'m-live ' + (s.online ? 'on' : '')}>{s.online ? T('live') : T('this device only')}</span>}</div>;
    body = <><FamilyCard onJoin={() => setUI({ dialog: 'join' })} /><LiveCard /><h3 className="section-title">{T('Latest from the family')}</h3><Feed /></>;
  }

  return (
    <div id="app" className="mobile">
      <div id="map" ref={mapRef} />

      <div className="m-top">
        <div className="m-title" onClick={() => ctl?.fitThailand()}>
          <div className="hud-kicker">{hud.kicker}</div>
          <h2 className="hud-title">{hud.title}</h2>
        </div>
        <div className="m-top-actions">
          <button id="installBtn" className="m-chip hidden" aria-label={T('Install app')}>⬇︎</button>
          <button className="m-chip" onClick={() => setLangPref(LANG === 'sv' ? 'en' : 'sv')}>{LANG === 'sv' ? 'EN' : 'SV'}</button>
        </div>
      </div>

      <div className="m-tools glass">
        <button className={'m-tool' + (ui.mode === 'note' ? ' active' : '')} onClick={() => { haptic(); startMode('note'); }} aria-label={T('Drop a note on the map')}>📍</button>
        <button className={'m-tool' + (ui.mode === 'meet' ? ' active' : '')} onClick={() => { haptic(); startMode('meet'); }} aria-label={T('Set a meetup point')}>🚩</button>
        <button className="m-tool" onClick={() => { haptic(); fitFamily(); }} aria-label={T('Find the family on the map')}>👪</button>
        <button className="m-tool" onClick={() => { haptic(); locate(); }} aria-label={T('Where am I?')}>🎯</button>
      </div>

      <ModeBanner />
      <ConnBanner className="m-conn" />

      <BottomSheet snap={snap} onSnap={setSnap} bottomOffset={TABBAR} header={header}
        page={[tab, ui.selected, ui.focus?.id, ui.draft?.kind, ui.view, tripDayMode() ? s.activePlanId : ''].join('|')} onHeightChange={(h) => { sheetH.current = h; }}>
        <div className="m-sheet-content" key={tab}>{body}</div>
      </BottomSheet>

      <nav className="m-tabbar glass" role="tablist">
        {([['explore', '🧭', T('Explore')], ['plan', '🗓️', T('Plan')], ['family', '💬', T('Family')]] as [Tab, string, string][]).map(([k, i, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={'m-tab' + (tab === k ? ' active' : '')} onClick={() => goTab(k)}>
            <span className="m-tab-ico">{i}{k === 'family' && unread && <span className="dot" />}</span>
            <span className="m-tab-label">{l}</span>
          </button>
        ))}
      </nav>

      <ModalSheet open={ui.dialog === 'join'} onClose={() => store.state.me && setUI({ dialog: null })}><JoinForm /></ModalSheet>
      <ModalSheet open={ui.dialog === 'trip' || ui.dialog === 'trip-edit'} onClose={() => setUI({ dialog: null })}>
        <TripForm trip={ui.dialog === 'trip-edit' ? activeTrip() : null} onDone={() => setUI({ dialog: null })} />
      </ModalSheet>
      <Toasts />
    </div>
  );
}
