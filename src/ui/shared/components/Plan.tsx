import type React from 'react';
import {
  DESTINATIONS, PLACE, CATEGORIES, rid, TEMPLATES, T, addDays, localToday, fmtDay, rng, nf, dayDiff,
  tripDays, transferInfo, ideasFor, domFare, flightBudget, flightOf, normIata, stayColor, stayPlaceName, stopCoord, legText, totalKm,
  googleFlights, skyscanner, stayLinks, planAsText, store, type DayPlan, type Flight, type Stay, type Trip, type TripDay,
} from '../../../core';
import { ui, setUI } from '../ui-store';
import { TPL_TYPES } from '../constants';
import {
  activePlan, activeTrip, addDomesticFlight, addStayFromDest, backToTimeline, deletePlan, deleteTrip, editPlan, editStop,
  getMap, ideaToDay, looseMode, moveStay, moveStop, newPlan, openDay, previewTemplate, removeFlight, removeStay, removeStop,
  selectPlace, setActivePlan, setActiveTrip, shareText, sortStops, startMode, stayNights, stepDay, templateToDay, toggleIdeas,
  tripDayMode, useTemplate, currentDayIndex,
} from '../actions';
import { ArmedButton, Ext, StayLinkRow } from './common';

const tripAsText = (trip: Trip) => {
  const { days } = tripDays(trip);
  const lines = [`🇹🇭 ${trip.name} — ${fmtDay(trip.start)} → ${fmtDay(addDays(trip.start, trip.days - 1))} (${T('{n} days', { n: trip.days })})`];
  trip.stays.forEach((s) => lines.push(`🧳 ${s.name}: ${s.nights} ${T(s.nights === 1 ? 'night' : 'nights')}`));
  lines.push('');
  days.forEach((d) => {
    const plan = store.dayPlan(trip, d.date);
    const bits = [
      ...d.flights.map((f) => `✈️ ${f.from}→${f.to}${f.dep ? ' ' + f.dep : ''}${f.flightNo ? ' ' + f.flightNo : ''}`),
      d.from && d.stay ? `🔁 ${stayPlaceName(d.from)} → ${stayPlaceName(d.stay)}` : '',
      ...(plan?.stops || []).map((s) => `${s.time ? s.time + ' ' : ''}${stopCoord(s)?.name || T('Stop')}`),
    ].filter(Boolean);
    lines.push(`${fmtDay(d.date)} · ${T('Day {n}', { n: d.i + 1 })}${d.base ? ' · ' + stayPlaceName(d.base) : ''}${bits.length ? '\n   ' + bits.join('\n   ') : ''}`);
  });
  return lines.join('\n');
};

// ── trip picker ──
export function TripBar({ onNewTrip }: { onNewTrip: () => void }) {
  const loose = store.state.plans.filter((p) => !p.tripId);
  const value = activeTrip()?.id || (looseMode() ? '__loose' : '');
  return (
    <div className="trip-bar">
      <select value={value} onChange={(e) => e.target.value && setActiveTrip(e.target.value)} aria-label={T('Choose trip')}>
        {store.state.trips.map((t) => <option key={t.id} value={t.id}>🧳 {t.name}{t.start ? ' · ' + fmtDay(t.start, { month: 'short', year: 'numeric' }) : ''}</option>)}
        {(loose.length > 0 || looseMode()) && <option value="__loose">📅 {T('Loose days')} ({loose.length})</option>}
        {!store.state.trips.length && !loose.length && <option value="">{T('No trips yet')}</option>}
      </select>
      <button className="btn primary" onClick={onNewTrip}>＋ {T('New trip')}</button>
    </div>
  );
}

export const TripWelcome = ({ onNewTrip }: { onNewTrip: () => void }) => (
  <div className="plan-card empty trip-welcome">
    <div className="big">🧳</div><b>{T('Plan your whole trip')}</b>
    <p>{T('Enter dates and flights, add the places you’ll stay, and get a day-by-day timeline with rough flight prices and ideas for every stop.')}</p>
    <button className="btn primary" onClick={onNewTrip}>＋ {T('Create a trip')}</button>
  </div>
);

// ── summary: flights + budget ──
function FlightRow({ trip, f }: { trip: Trip; f: Flight }) {
  const ret = f.kind === 'out' ? flightOf(trip, 'home')?.date : '';
  const fare = f.kind === 'domestic' ? domFare(f.from, f.to) : null;
  return (
    <li className={'flight ' + f.kind}>
      <div>
        <b>{f.kind === 'home' ? '🏠' : f.kind === 'out' ? '🛫' : '✈️'} {f.from || '?'} → {f.to || '?'}</b>
        {f.flightNo && <span className="badge">{f.flightNo}</span>}{' '}
        {fare && <span className="fare">≈ {rng(fare.lo, fare.hi, '฿')}{fare.rough ? ` (${T('rough')})` : ''}</span>}
        <div className="muted">
          {fmtDay(f.date)}{f.dep ? ' ' + f.dep : ''}{f.arr ? ` → ${f.arr}` : ''}{f.arr && f.arrDate && f.arrDate !== f.date ? <sup>+{dayDiff(f.date, f.arrDate)}</sup> : null}
          {f.kind === 'out' && ret ? ` · ${T('return')} ${fmtDay(ret)}` : ''}
        </div>
        {f.from && f.to && f.date && f.kind !== 'home' && (
          <div className="link-row"><Ext href={googleFlights(f.from, f.to, f.date, ret)}>Google Flights</Ext><Ext href={skyscanner(f.from, f.to, f.date, ret, trip.travellers)}>Skyscanner</Ext></div>
        )}
      </div>
      {f.kind === 'domestic' && <button className="icon-btn" onClick={() => removeFlight(trip, f.id)} aria-label={T('Remove')}>✕</button>}
    </li>
  );
}

export function TripSummary({ trip, onEdit }: { trip: Trip; onEdit: () => void }) {
  const last = addDays(trip.start, trip.days - 1);
  const flights = [flightOf(trip, 'out'), ...trip.flights.filter((f) => f.kind === 'domestic').sort((a, b) => (a.date + a.dep).localeCompare(b.date + b.dep)), flightOf(trip, 'home')].filter(Boolean) as Flight[];
  const b = flightBudget(trip), n = trip.travellers;
  return (
    <div className="card trip-sum">
      <div className="trip-sum-head">
        <div><h3>{trip.name}</h3>
          <p className="muted">{fmtDay(trip.start)} – {fmtDay(last, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {T('{n} days', { n: trip.days })} · 👥 {n}</p></div>
        <button className="icon-btn" onClick={onEdit} aria-label={T('Edit trip')}>✏️</button>
      </div>
      <ul className="flights">{flights.map((f) => <FlightRow key={f.id} trip={trip} f={f} />)}</ul>
      <div className="cost">
        <div className="cost-title">💰 {T('Rough flight budget')}</div>
        {b.intl ? <div>🌏 {T('Return')} {trip.home}–{normIata(b.out!.to)}, {b.intl.season}: <b>{rng(b.intl.lo * n, b.intl.hi * n, 'SEK')}</b> <span className="muted">({n} × {rng(b.intl.lo, b.intl.hi, 'SEK')})</span></div>
          : b.out ? <div>🌏 {T('No guide price from {from} — use the search buttons above.', { from: trip.home || '?' })}</div> : null}
        {b.domestic.count > 0 && <div>🇹🇭 {T(b.domestic.count > 1 ? '{n} domestic flights' : '{n} domestic flight', { n: b.domestic.count })}: <b>{rng(b.domestic.lo * n, b.domestic.hi * n, '฿')}</b> <span className="muted">({T('{n} travellers', { n })})</span></div>}
        <div className="muted small-print">{T('Guide prices only — real fares vary a lot with dates and airline.')}{b.domestic.count ? '' : ' ' + T('Add domestic flights from the timeline to include them.')}</div>
      </div>
      <div className="plan-foot">
        <button className="btn small" onClick={() => getMap()?.fitTrip(trip)}>🗺️ {T('Show trip')}</button>
        <button className="btn small" onClick={() => shareText(tripAsText(trip))}>📤 {T('Share as text')}</button>
        <ArmedButton onConfirm={() => deleteTrip(trip)}>🗑 {T('Delete trip')}</ArmedButton>
      </div>
    </div>
  );
}

// ── stays + ideas ──
function IdeasList({ trip, s, dayIdx }: { trip: Trip; s: Stay; dayIdx: number[] }) {
  const { places, tpls } = ideasFor(s);
  const { days } = tripDays(trip);
  if (!places.length && !tpls.length) return <p className="muted small-print">{T('No curated places near this stop yet — try the tour links above.')}</p>;
  const opts = dayIdx.map((i) => <option key={i} value={i}>{T('Day {n}', { n: i + 1 })} · {fmtDay(days[i].date)}</option>);
  return (
    <div className="ideas">
      {places.map((p) => (
        <div className="idea" key={p.id} style={{ ['--c' as string]: CATEGORIES[p.cat].color }}>
          <span className="idea-name" onClick={() => selectPlace(p.id)}>{CATEGORIES[p.cat].icon} {p.name}</span>
          <select value="" onChange={(e) => e.target.value !== '' && ideaToDay(trip, p.id, Number(e.target.value))} aria-label={p.name}>
            <option value="">＋ {T('Day…')}</option>{opts}
          </select>
        </div>
      ))}
      {tpls.map((t) => (
        <div className="idea tpl-idea" key={t.id}>
          <span className="idea-name" onClick={() => previewTemplate(t)}>📋 {t.name}</span>
          <select value="" onChange={(e) => e.target.value !== '' && templateToDay(trip, t.id, Number(e.target.value))} aria-label={t.name}>
            <option value="">{T('Use on…')}</option>{opts}
          </select>
        </div>
      ))}
    </div>
  );
}

export function StaysCard({ trip }: { trip: Trip }) {
  const { days, ranges, totalNights, diff } = tripDays(trip);
  return (
    <div className="card stays-card">
      <h3>🧳 {T('Where you’ll stay')}</h3>
      <p className="muted">{T('{n} nights in Thailand', { n: totalNights })}
        {diff > 0 ? <> · <span className="warn">⚠️ {T(diff > 1 ? '{n} nights not planned yet' : '{n} night not planned yet', { n: diff })}</span></>
          : diff < 0 ? <> · <span className="warn">⚠️ {T(diff < -1 ? '{n} nights too many' : '{n} night too many', { n: -diff })}</span></>
            : <> · ✅ {T('all nights planned')}</>}
      </p>
      <ol className="stay-list">
        {trip.stays.map((s, k) => {
          const r = ranges[s.id] || { from: 0, to: 0 };
          const open = ui.openIdeas.has(s.id);
          const dayIdx = days.filter((d) => d.base === s && !d.inAir).map((d) => d.i);
          return (
            <li className="stay" key={s.id} style={{ ['--c' as string]: stayColor(trip, s) }}>
              <div className="stay-row">
                <div className="stay-num">{k + 1}</div>
                <div className="stay-main">
                  <div className="stay-name" onClick={() => s.lat != null && getMap()?.flyTo({ lat: s.lat, lng: s.lng! }, 12)}>{s.name}</div>
                  <div className="muted">{r.to > r.from ? `${fmtDay(addDays(trip.start, r.from))} → ${fmtDay(addDays(trip.start, r.to))}` : T('outside the trip dates')}</div>
                </div>
                <div className="nights">
                  <button className="icon-btn" onClick={() => stayNights(trip, s, -1)} disabled={s.nights <= 0} aria-label="−1">−</button>
                  <b>{s.nights}</b><span>{T(s.nights === 1 ? 'night' : 'nights')}</span>
                  <button className="icon-btn" onClick={() => stayNights(trip, s, 1)} aria-label="+1">＋</button>
                </div>
                <div className="ctrl">
                  <button className="icon-btn" onClick={() => moveStay(trip, s, -1)} disabled={k === 0} aria-label="▲">▲</button>
                  <button className="icon-btn" onClick={() => moveStay(trip, s, 1)} disabled={k === trip.stays.length - 1} aria-label="▼">▼</button>
                  <ArmedButton className="icon-btn" onConfirm={() => removeStay(trip, s)}>✕</ArmedButton>
                </div>
              </div>
              {r.to > r.from && <StayLinkRow u={stayLinks(trip, s, r)} />}
              <button className="ideas-toggle" onClick={() => toggleIdeas(s.id)}>💡 {T('Things to do near {name}', { name: stayPlaceName(s) })} {open ? '▴' : '▾'}</button>
              {open && <IdeasList trip={trip} s={s} dayIdx={dayIdx} />}
            </li>
          );
        })}
      </ol>
      <select value="" onChange={(e) => { const v = e.target.value; if (v === '__map') startMode('stay'); else if (v) addStayFromDest(trip, v); }} aria-label={T('Add a stop…')}>
        <option value="">＋ {T('Add a stop…')}</option>
        {DESTINATIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        <option value="__map">📍 {T('Pick a spot on the map…')}</option>
      </select>
    </div>
  );
}

// ── timeline ──
function TravelHints({ trip, d }: { trip: Trip; d: TripDay }) {
  const out: React.ReactElement[] = [];
  if (d.from && d.stay) {
    const t = transferInfo(d.from, d.stay);
    const added = t.fly && trip.flights.some((f) => f.kind === 'domestic' && f.date === d.date && normIata(f.from) === t.fly!.from && normIata(f.to) === t.fly!.to);
    out.push(<div className="tl-move" key="m">🔁 {stayPlaceName(d.from)} → {stayPlaceName(d.stay)} <span className="muted">· ~{nf(t.d)} km</span></div>);
    if (t.fly && !added) out.push(<div className="tl-hint" key="f">✈️ {t.fly.from}→{t.fly.to}{t.fly.fare ? ` ≈ ${rng(t.fly.fare.lo, t.fly.fare.hi, '฿')} ${T('pp')}` : ''}
      <button className="btn tiny" onClick={(e) => { e.stopPropagation(); addDomesticFlight(trip, d.i); }}>＋ {T('Add flight')}</button></div>);
    if (t.ground && (!t.fly || !added)) out.push(<div className="tl-hint" key="g">{t.fly ? T('or') + ' ' : ''}{t.ground}</div>);
  }
  if (d.hop) {
    const hop = d.hop;
    const added = trip.flights.some((f) => f.kind === 'domestic' && f.date === d.date && normIata(f.from) === hop.from && normIata(f.to) === hop.to);
    const fare = domFare(hop.from, hop.to);
    if (!added) out.push(<div className="tl-hint" key="h">🔗 {T('Connection')} {hop.from}→{hop.to}{fare ? ` ≈ ${rng(fare.lo, fare.hi, '฿')} ${T('pp')}` : ''}
      <button className="btn tiny" onClick={(e) => { e.stopPropagation(); addDomesticFlight(trip, d.i, true); }}>＋ {T('Add flight')}</button></div>);
  }
  return <>{out}</>;
}

export function Timeline({ trip }: { trip: Trip }) {
  const { days } = tripDays(trip);
  const today = localToday();
  return (
    <>
      <h3 className="section-title">🗓️ {T('Day by day')}</h3>
      <ol className="timeline">
        {days.map((d) => {
          const stops = store.dayPlan(trip, d.date)?.stops || [];
          const c = d.base ? stayColor(trip, d.base) : '#94a3b8';
          return (
            <li key={d.i} className={'tl-day' + (d.from ? ' travel' : '') + (d.date === today ? ' today' : '')} style={{ ['--c' as string]: c }}
              onClick={() => openDay(trip, d.i)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openDay(trip, d.i)}>
              <div className="tl-date"><span>{fmtDay(d.date, { weekday: 'short' })}</span><b>{fmtDay(d.date, { day: 'numeric' })}</b><span>{fmtDay(d.date, { month: 'short' })}</span></div>
              <div className="tl-body">
                <div className="tl-title"><span className="tl-n">{T('Day {n}', { n: d.i + 1 })}</span> {d.inAir ? '✈️ ' + T('On the way to Thailand') : d.base ? stayPlaceName(d.base) : <span className="warn">{T('No stop planned')}</span>}</div>
                {d.flights.map((f) => <div className="tl-flight" key={f.id}>{f.kind === 'home' ? '🏠' : '🛫'} {f.from}→{f.to}{f.dep ? ' ' + f.dep : ''}{f.flightNo ? ' · ' + f.flightNo : ''}</div>)}
                {d.arrivals.map((f) => <div className="tl-flight" key={'a' + f.id}>🛬 {T('Land')} {f.to}{f.arr ? ' ' + f.arr : ''}</div>)}
                <TravelHints trip={trip} d={d} />
                <div className="tl-acts">{stops.length
                  ? <>{stops.slice(0, 4).map((s, i) => <span key={s.id}>{i ? ' · ' : ''}{s.time && <b>{s.time} </b>}{stopCoord(s)?.name || T('Stop')}</span>)}{stops.length > 4 && ` · ${T('+{n} more', { n: stops.length - 4 })}`}</>
                  : <span className="muted">{d.inAir ? '' : T('Tap to plan this day')}</span>}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ── one day ──
export function DayHeader({ trip, plan }: { trip: Trip; plan: DayPlan }) {
  const idx = currentDayIndex();
  const d = tripDays(trip).days[idx];
  return (
    <>
      <div className="day-head">
        <button className="btn small" onClick={backToTimeline}>← {T('Timeline')}</button>
        <div className="day-nav">
          <button className="icon-btn" onClick={() => stepDay(-1)} disabled={idx <= 0} aria-label={T('Previous day')}>‹</button>
          <b>{T('Day {n}', { n: idx + 1 })} · {fmtDay(plan.date as string)}</b>
          <button className="icon-btn" onClick={() => stepDay(1)} disabled={idx >= trip.days - 1} aria-label={T('Next day')}>›</button>
        </div>
      </div>
      {d?.from && d.stay && <div className="day-note">🔁 {T('Travel day:')} {stayPlaceName(d.from)} → {stayPlaceName(d.stay)}</div>}
      {d && d.flights.length > 0 && <div className="day-note">{d.flights.map((f) => `✈️ ${f.from}→${f.to}${f.dep ? ' ' + f.dep : ''}`).join(' · ')}</div>}
    </>
  );
}

export function DayEditor({ plan }: { plan: DayPlan }) {
  const stops = plan.stops;
  return (
    <div className="plan-card">
      <div className="plan-head">
        <input type="text" value={plan.name} maxLength={120} aria-label={T('Day name')} onChange={(e) => editPlan(plan, { name: e.target.value })} />
        {!plan.tripId && <input type="date" value={plan.date || ''} aria-label="Date" onChange={(e) => editPlan(plan, { date: e.target.value })} />}
      </div>
      <div className="plan-stats"><span>📍 {T('{n} stops', { n: stops.length })}</span><span>📏 ~{totalKm(stops).toFixed(1)} km</span>{plan.updatedBy && <span>✏️ {plan.updatedBy}</span>}</div>
      {stops.length ? (
        <ol className="stops">
          {stops.map((s, i) => {
            const c = stopCoord(s);
            return [
              i > 0 && <li className="leg" key={'l' + s.id}>{legText(stops[i - 1], s)}</li>,
              <li className="stop" key={s.id}>
                <div className="num">{i + 1}</div>
                <div>
                  <div className="name" onClick={() => (s.place ? selectPlace(s.place) : c && getMap()?.flyTo(c, 15))}>{c?.name || T('Stop')}</div>
                  <div className="row2">
                    <input type="time" value={s.time || ''} onChange={(e) => editStop(plan, i, { time: e.target.value })} />
                    <input type="text" value={s.note || ''} placeholder={T('Note…')} maxLength={500} onChange={(e) => editStop(plan, i, { note: e.target.value })} />
                  </div>
                </div>
                <div className="ctrl">
                  <button className="icon-btn" onClick={() => moveStop(plan, i, -1)} disabled={i === 0} aria-label="▲">▲</button>
                  <button className="icon-btn" onClick={() => moveStop(plan, i, 1)} disabled={i === stops.length - 1} aria-label="▼">▼</button>
                  <button className="icon-btn" onClick={() => removeStop(plan, i)} aria-label={T('Remove')}>✕</button>
                </div>
              </li>,
            ];
          })}
        </ol>
      ) : <p className="muted" style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: T('No stops yet. Open a place and tap <b>Add to day</b>, or add a custom stop on the map.') }} />}
      <div className="plan-foot">
        <button className="btn small" onClick={() => getMap()?.fitStops(plan.stops)}>🗺️ {T('Show on map')}</button>
        <button className="btn small" onClick={() => startMode('stop')}>📌 {T('Custom stop')}</button>
        <button className="btn small" onClick={() => sortStops(plan)}>🕘 {T('Sort by time')}</button>
        <button className="btn small" onClick={() => shareText(planAsText(plan))}>📤 {T('Share as text')}</button>
        {!plan.tripId && <ArmedButton onConfirm={() => deletePlan(plan)}>🗑 {T('Delete day')}</ArmedButton>}
      </div>
    </div>
  );
}

export function DayIdeas({ trip, plan }: { trip: Trip; plan: DayPlan }) {
  const d = tripDays(trip).days[currentDayIndex()];
  const s = d?.base; if (!s) return null;
  const { places, tpls } = ideasFor(s, 10);
  const inDay = new Set(plan.stops.map((x) => x.place));
  const r = tripDays(trip).ranges[s.id];
  return (
    <div className="card day-ideas">
      <h3>💡 {T('Ideas near {name}', { name: stayPlaceName(s) })}</h3>
      {r && <StayLinkRow u={stayLinks(trip, s, r)} />}
      <div className="ideas">
        {places.map((p) => (
          <div className="idea" key={p.id} style={{ ['--c' as string]: CATEGORIES[p.cat].color }}>
            <span className="idea-name" onClick={() => selectPlace(p.id)}>{CATEGORIES[p.cat].icon} {p.name}</span>
            {inDay.has(p.id) ? <span className="muted">✓ {T('added')}</span>
              : <button className="btn tiny" onClick={() => { plan.stops.push({ id: rid(), time: '', note: '', place: p.id }); store.queueSave(plan, 0); store.changed('plans'); }}>＋ {T('Add')}</button>}
          </div>
        ))}
        {tpls.map((t) => (
          <div className="idea tpl-idea" key={t.id}>
            <span className="idea-name" onClick={() => previewTemplate(t)}>📋 {t.name}</span>
            <button className="btn tiny" onClick={() => useTemplate(t.id)}>＋ {T('Use')}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── loose days & ready-made days ──
export function LooseDays() {
  const loose = store.state.plans.filter((p) => !p.tripId).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.name.localeCompare(b.name));
  const plan = activePlan();
  return (
    <>
      <div className="plan-top">
        <select value={plan && !plan.tripId ? plan.id : ''} onChange={(e) => e.target.value && setActivePlan(e.target.value)} aria-label={T('Choose day')}>
          {loose.length ? loose.map((p) => <option key={p.id} value={p.id}>{p.date ? p.date + ' · ' : ''}{p.name} ({p.stops.length})</option>) : <option value="">{T('No days planned yet')}</option>}
        </select>
        <button className="btn" onClick={() => newPlan()}>＋ {T('New day')}</button>
      </div>
      {plan && !plan.tripId ? <DayEditor plan={plan} />
        : <div className="plan-card empty" dangerouslySetInnerHTML={{ __html: T('Create a day, pick a ready-made one below,<br/>or tap <b>Add to day</b> on any place.') }} />}
    </>
  );
}

export function Templates() {
  return (
    <>
      <h3 className="section-title">{T('Ready-made days')}</h3>
      <div className="chips small">
        {Object.entries(TPL_TYPES).map(([k, l]) => <button key={k} className={'chip' + (ui.tplType === k ? ' on' : '')} onClick={() => setUI({ tplType: k })}>{l}</button>)}
      </div>
      <div className="templates">
        {TEMPLATES.filter((t) => ui.tplType === 'all' || t.type === ui.tplType).map((t) => (
          <div className="tpl" key={t.id}>
            <b>{t.name}</b>
            <p>{t.blurb}</p>
            <p>📍 {T('{n} stops', { n: t.stops.length })} · ~{totalKm(t.stops).toFixed(0)} km</p>
            <div className="tpl-acts">
              <button className="btn small" onClick={() => previewTemplate(t)}>{ui.preview?.id === t.id ? '✕ ' + T('Hide preview') : '👀 ' + T('Preview')}</button>
              <button className="btn small primary" onClick={() => useTemplate(t.id)}>＋ {tripDayMode() ? T('Add to this day') : T('Use as a day')}</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Whole Plan tab body: trip overview, or one trip day, or loose days. Shared by both shells. */
export function PlanTab({ onNewTrip, onEditTrip }: { onNewTrip: () => void; onEditTrip: () => void }) {
  const trip = activeTrip();
  const plan = activePlan();
  if (trip && tripDayMode() && plan) {
    return (<><DayHeader trip={trip} plan={plan} /><DayEditor plan={plan} /><DayIdeas trip={trip} plan={plan} /><Templates /></>);
  }
  if (trip) return (<div className="trip-view"><TripSummary trip={trip} onEdit={onEditTrip} /><StaysCard trip={trip} /><Timeline trip={trip} /></div>);
  if (looseMode()) return (<><LooseDays /><Templates /></>);
  return (<><TripWelcome onNewTrip={onNewTrip} /><Templates /></>);
}

export { PLACE };
