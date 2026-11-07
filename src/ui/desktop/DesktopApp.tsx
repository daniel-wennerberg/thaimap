// Desktop shell: full-screen map with a floating glass panel (tabs), HUD title + stat cards, tool column.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LANG, LS, T, store } from '../../core';
import { ui, setUI, useApp } from '../shared/ui-store';
import { useMapController, hudData } from '../shared/useMapController';
import {
  activeTrip, fitFamily, getTab, locate, selectPlace, setLangPref, setTab, startMode, type Tab,
} from '../shared/actions';
import { Toasts, ConnBanner } from '../shared/components/common';
import { SearchRow, CategoryChips, PlaceList, PlaceDetail } from '../shared/components/Explore';
import { TripBar, PlanTab } from '../shared/components/Plan';
import { FamilyCard, LiveCard, Feed, MeetupDetail, NoteDetail, DraftComposer, ModeBanner } from '../shared/components/Family';
import { TripForm, JoinForm } from '../shared/components/Forms';

function Modal({ open, onClose, wide, children }: { open: boolean; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return <dialog ref={ref} className={'dialog' + (wide ? ' wide' : '')} onClose={onClose} onCancel={onClose}>{open && children}</dialog>;
}

export default function DesktopApp() {
  useApp();
  const [panelOff, setPanelOff] = useState(LS.get('panelOff', false));
  const panelRef = useRef<HTMLElement>(null);
  const insets = () => {
    const r = panelRef.current?.getBoundingClientRect();
    return { l: panelOff || !r ? 0 : r.right + 8, t: 70, r: 100, b: 20 };
  };
  const { ref: mapRef, ctl } = useMapController(insets);
  const tab = getTab();

  const togglePanel = (on: boolean) => {
    const before = ctl?.currentInsets();
    setPanelOff(!on); LS.set('panelOff', !on);
    if (before) setTimeout(() => ctl?.shiftForInsets(before), on ? 320 : 0);
  };

  // first visit: ask who you are
  useEffect(() => {
    const urlFamily = new URLSearchParams(location.search).get('family');
    if ((urlFamily && urlFamily.toLowerCase() !== store.state.family) || !store.state.me) setTimeout(() => setUI({ dialog: 'join' }), 300);
    store.connect();
  }, []);

  const hud = hudData();
  const unread = tab !== 'family' && store.hasUnread();
  const s = store.state;
  const focusCard = ui.draft ? <DraftComposer key={`${ui.draft.kind}${ui.draft.lat}${ui.draft.lng}`} />
    : ui.focus?.type === 'meetup' ? <MeetupDetail id={ui.focus.id} onClose={() => setUI({ focus: null })} />
      : ui.focus?.type === 'note' ? <NoteDetail id={ui.focus.id} onClose={() => setUI({ focus: null })} /> : null;

  return (
    <div id="app" className={'desktop' + (panelOff ? ' panel-off' : '')}>
      <aside className="panel" ref={panelRef}>
        <header className="brand">
          <div className="brand-mark">🇹🇭</div>
          <div>
            <h1>ThaiMap</h1>
            <p className="family-badge" onClick={() => setUI({ dialog: 'join' })}>
              {s.family && s.me ? <>{s.me.name} · {T('family')} <b>{s.family}</b> {s.online ? '🟢' : '🟠'}</> : T('Tap to join your family →')}
            </p>
          </div>
          <button id="installBtn" className="lang-btn hidden" type="button" aria-label={T('Install app')}>⬇︎</button>
          <button className="lang-btn" onClick={() => setLangPref(LANG === 'sv' ? 'en' : 'sv')} title={LANG === 'sv' ? 'Switch to English' : 'Byt till svenska'}>{LANG === 'sv' ? '🇬🇧 EN' : '🇸🇪 SV'}</button>
          <button className="panel-hide" onClick={() => togglePanel(false)} title={T('Hide panel')} aria-label={T('Hide panel')}>⟨</button>
        </header>
        <nav className="tabs" role="tablist">
          {([['explore', '🧭', T('Explore')], ['plan', '🗓️', T('Plan')], ['family', '💬', T('Family')]] as [Tab, string, string][]).map(([k, i, l]) => (
            <button key={k} className={'tab' + (tab === k ? ' active' : '')} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {i} {l}{k === 'family' && unread && <span className="dot" />}
            </button>
          ))}
        </nav>
        <section className="tab-body" key={tab}>
          {tab === 'explore' && <>
            {ui.selected && <PlaceDetail id={ui.selected} onClose={() => selectPlace(null)} />}
            <SearchRow /><CategoryChips /><PlaceList />
          </>}
          {tab === 'plan' && <>
            <TripBar onNewTrip={() => setUI({ dialog: 'trip' })} />
            <PlanTab onNewTrip={() => setUI({ dialog: 'trip' })} onEditTrip={() => setUI({ dialog: 'trip-edit' })} />
          </>}
          {tab === 'family' && <>
            <FamilyCard onJoin={() => setUI({ dialog: 'join' })} />
            <LiveCard />
            <h3 className="section-title">{T('Latest from the family')}</h3>
            <Feed />
          </>}
        </section>
      </aside>
      <button className="panel-show glass" onClick={() => togglePanel(true)} title={T('Show panel')} aria-label={T('Show panel')}>☰</button>

      <main id="mapWrap">
        <div id="map" ref={mapRef} />
        <div className="map-hud"><div className="hud-kicker">{hud.kicker}</div><h2 className="hud-title">{hud.title}</h2></div>
        <div className="hud-stats">{hud.stats.map((x) => (
          <div className="stat glass" key={x.label} style={{ ['--c' as string]: x.color }}>
            <div className="stat-label"><i />{x.label}</div>
            <div className="stat-value">{x.value}{x.small && <small>{x.small}</small>}</div>
            {x.sub && <div className="stat-sub">{x.sub}</div>}
          </div>
        ))}</div>
        <div className="fab-stack glass">
          <button className={'fab' + (ui.mode === 'note' ? ' active' : '')} onClick={() => startMode('note')} title={T('Drop a note on the map')}>📍<span>{T('Note')}</span></button>
          <button className={'fab' + (ui.mode === 'meet' ? ' active' : '')} onClick={() => startMode('meet')} title={T('Set a meetup point')}>🚩<span>{T('Meet')}</span></button>
          <button className="fab" onClick={fitFamily} title={T('Find the family on the map')}>👪</button>
          <button className="fab" onClick={locate} title={T('Where am I?')}>🎯</button>
          <button className="fab" onClick={() => ctl?.fitThailand()} title={T('Show all of Thailand')}>🗺️</button>
        </div>
        {focusCard && <div className="map-card">{focusCard}</div>}
        <ModeBanner />
        <ConnBanner />
      </main>

      <Modal open={ui.dialog === 'join'} onClose={() => setUI({ dialog: null })}><JoinForm /></Modal>
      <Modal open={ui.dialog === 'trip' || ui.dialog === 'trip-edit'} wide onClose={() => setUI({ dialog: null })}>
        <TripForm trip={ui.dialog === 'trip-edit' ? activeTrip() : null} onDone={() => setUI({ dialog: null })} />
      </Modal>
      <Toasts />
    </div>
  );
}
