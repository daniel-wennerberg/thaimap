import type React from 'react';
import { useEffect, useState } from 'react';
import {
  CATEGORIES, PLACES, PLACE, PRICE, REGIONS, T, km, fmtDay, tripDays, stayPlaceName, directions, placeSearch, store,
  type LatLng, type Place,
} from '../../../core';
import { ui, setUI } from '../ui-store';
import { placeInList } from '../../map/MapController';
import { activeTrip, activePlan, addToDay, currentDayIndex, openMeetupDraft, selectPlace, setRegion, toggleCat, tripDayMode, getMap } from '../actions';
import { PlaceThread } from './Comments';
import { Ext } from './common';

export function SearchRow() {
  const [q, setQ] = useState(ui.query);
  useEffect(() => { const t = setTimeout(() => setUI({ query: q.trim() }), 150); return () => clearTimeout(t); }, [q]);
  return (
    <div className="search">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T('Search temples, beaches, khao soi…')} autoComplete="off" />
      <select value={ui.region} onChange={(e) => setRegion(e.target.value)} aria-label={T('Jump to region')}>
        {Object.entries(REGIONS).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
      </select>
    </div>
  );
}

export function CategoryChips() {
  const all = Object.keys(CATEGORIES);
  const allOn = ui.cats.size === all.length;
  const counts: Record<string, number> = {};
  PLACES.forEach((p) => { if (ui.region === 'all' || p.region === ui.region) counts[p.cat] = (counts[p.cat] || 0) + 1; });
  return (
    <div className="chips">
      <button className={'chip' + (allOn ? ' on' : '')} style={{ ['--c' as string]: 'var(--ink)' }} onClick={() => toggleCat(null, all)}>{T('All')}</button>
      {Object.entries(CATEGORIES).map(([k, c]) => (
        <button key={k} className={'chip' + (!allOn && ui.cats.has(k) ? ' on' : '')} style={{ ['--c' as string]: c.color }} onClick={() => toggleCat(k, all)}>
          {c.icon} {c.label} <span className="n">{counts[k] || 0}</span>
        </button>
      ))}
    </div>
  );
}

export function PlaceList() {
  const list = PLACES.filter(placeInList);
  if (!list.length) return <div className="empty">{T('Nothing matches. Try another search or category.')}</div>;
  const groups: Record<string, Place[]> = {};
  list.forEach((p) => (groups[p.cat] ||= []).push(p));
  return (
    <div className="list">
      {Object.keys(CATEGORIES).filter((k) => groups[k]).map((k) => {
        const c = CATEGORIES[k];
        return (
          <div className="list-group" key={k}>
            <h4>{c.icon} {c.label} · {groups[k].length}</h4>
            {groups[k].map((p) => {
              const n = store.state.notes.filter((x) => x.placeId === p.id).length;
              return (
                <div key={p.id} className="place-row" style={{ ['--c' as string]: c.color }} onClick={() => selectPlace(p.id)} role="button" tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && selectPlace(p.id)}>
                  <div className="ico">{c.icon}</div>
                  <div>
                    <div className="t">{p.name}{p.price ? <span className="badge">{PRICE[p.price]}</span> : null}{n ? <span className="badge hot">💬 {n}</span> : null}</div>
                    <div className="s">{p.desc || REGIONS[p.region]?.label || ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** "Add to day" choices: every day of the active trip (preselect the day you're near), then loose days. */
function useDayTarget(place: Place): [string, (v: string) => void, React.ReactElement] {
  const trip = activeTrip();
  let def = '__new';
  const opts: React.ReactElement[] = [];
  if (trip) {
    const { days } = tripDays(trip);
    let pick = tripDayMode() ? currentDayIndex() : -1;
    if (pick < 0) { const near = days.find((d) => d.base && d.base.lat != null && !d.inAir && km(d.base as LatLng, place) < 40); pick = near ? near.i : 0; }
    def = `t|${trip.id}|${pick}`;
    opts.push(<optgroup key="trip" label={trip.name}>{days.map((d) => (
      <option key={d.i} value={`t|${trip.id}|${d.i}`}>{T('Day {n}', { n: d.i + 1 })} · {fmtDay(d.date)}{d.base ? ' · ' + stayPlaceName(d.base) : ''}</option>))}</optgroup>);
  }
  const loose = store.state.plans.filter((p) => !p.tripId);
  if (loose.length) {
    if (!trip) def = activePlan()?.tripId ? loose[0].id : activePlan()?.id || loose[0].id;
    opts.push(<optgroup key="loose" label={T('Loose days')}>{loose.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>);
  }
  opts.push(<option key="new" value="__new">＋ {T('New day…')}</option>);
  const [v, setV] = useState(def);
  useEffect(() => setV(def), [place.id, def]);
  return [v, setV, <>{opts}</>];
}

export function PlaceDetail({ id, onClose }: { id: string; onClose?: () => void }) {
  const p = PLACE[id];
  const [target, setTarget, options] = useDayTarget(p);
  if (!p) return null;
  const c = CATEGORIES[p.cat];
  return (
    <div className="detail" style={{ ['--c' as string]: c.color }}>
      <div className="detail-head">
        <div className="kicker">{c.icon} {c.label} · {REGIONS[p.region]?.label || ''}</div>
        {onClose && <button className="icon-btn" onClick={onClose} aria-label={T('Close')}>✕</button>}
      </div>
      <h2>{p.name}</h2>
      <div className="meta">
        {p.duration && <span>⏱ {p.duration}</span>}
        {p.difficulty && <span>🥾 {p.difficulty}</span>}
        {p.price ? <span>{PRICE[p.price]}</span> : null}
        {p.iata && <span>IATA {p.iata} · {p.intl ? T('International') : T('Domestic')}</span>}
      </div>
      {p.desc && <p>{p.desc}</p>}
      {p.tip && <p className="tip"><b>{T('Tip:')}</b> {p.tip}</p>}
      <div className="detail-actions add-row">
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label={T('Add to day')}>{options}</select>
        <button className="btn accent small" onClick={() => addToDay(target, { place: p.id })}>{T('Add to day')}</button>
      </div>
      <div className="detail-actions">
        <Ext className="btn small" href={directions(p.lat, p.lng)}>🧭 {T('Directions')}</Ext>
        <Ext className="btn small" href={placeSearch(p.name)}>⭐ {T('Reviews & photos')}</Ext>
        <button className="btn small" onClick={() => getMap()?.flyTo(p, 16)}>🔍 {T('Zoom in')}</button>
        {p.cat !== 'airport' && <button className="btn small" onClick={() => openMeetupDraft(p, p.name, p.id)}>🚩 {T('Meet here')}</button>}
      </div>
      <PlaceThread placeId={p.id} placeName={p.name} />
    </div>
  );
}

export const closeDetail = () => selectPlace(null);
