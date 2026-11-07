import { useState, type FormEvent } from 'react';
import { AIRPORTS, T, store, type Trip } from '../../../core';
import { COLORS } from '../constants';
import { joinFamily, randomCode, saveTripForm, tripFormDefaults, type TripForm as TF } from '../actions';

const intl = AIRPORTS.filter((a) => a.intl);
const airportOpts = intl.map((a) => <option key={a.iata} value={a.iata}>{a.iata} · {a.name.replace(/\s*\([A-Z]{3}\)$/, '')}</option>);

export function TripForm({ trip, onDone }: { trip?: Trip | null; onDone: () => void }) {
  const [f, setF] = useState<TF>(() => tripFormDefaults(trip));
  const set = <K extends keyof TF>(k: K) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => { e.preventDefault(); saveTripForm(f, trip); onDone(); };
  return (
    <form className="trip-form" onSubmit={submit}>
      <h2>{trip ? T('Edit trip') : T('New trip')}</h2>
      <label><span>{T('Trip name')}</span><input value={f.name} onChange={set('name')} required maxLength={120} placeholder={T('e.g. Thailand 2027')} autoFocus={!trip} /></label>
      <div className="grid3">
        <label><span>{T('First day')}</span><input type="date" value={f.start} onChange={set('start')} required /></label>
        <label><span>{T('Days')}</span><input type="number" min={1} max={120} value={f.days} onChange={set('days')} required /></label>
        <label><span>{T('Travellers')}</span><input type="number" min={1} max={20} value={f.travellers} onChange={set('travellers')} required /></label>
      </div>
      <fieldset>
        <legend>✈️ {T('Flight out')}</legend>
        <div className="grid3">
          <label><span>{T('From')}</span><input value={f.home} onChange={set('home')} maxLength={3} placeholder="ARN" pattern="[A-Za-z]{3}" required /></label>
          <label><span>{T('To')}</span><select value={f.outTo} onChange={set('outTo')}>{airportOpts}</select></label>
          <label><span>{T('Flight no.')}</span><input value={f.outNo} onChange={set('outNo')} maxLength={12} placeholder="TG961" /></label>
        </div>
        <div className="grid3">
          <label><span>{T('Departs')}</span><input type="time" value={f.outDep} onChange={set('outDep')} /></label>
          <label><span>{T('Lands')}</span><input type="time" value={f.outArr} onChange={set('outArr')} /></label>
          <label><span>{T('Lands on')}</span><select value={f.outArrNext} onChange={set('outArrNext')}>
            <option value={0}>{T('Same day')}</option><option value={1}>{T('+1 day')}</option></select></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>🏠 {T('Flight home')} <span className="muted">{T('(on the last day)')}</span></legend>
        <div className="grid3">
          <label><span>{T('From')}</span><select value={f.homeFrom} onChange={set('homeFrom')}>{airportOpts}</select></label>
          <label><span>{T('Flight no.')}</span><input value={f.homeNo} onChange={set('homeNo')} maxLength={12} placeholder="TG960" /></label>
          <label><span>{T('Departs')}</span><input type="time" value={f.homeDep} onChange={set('homeDep')} /></label>
        </div>
      </fieldset>
      <p className="muted small-print">{T('Prices in the app are rough guide prices. Use the Google Flights / Skyscanner buttons for real fares.')}</p>
      <div className="dialog-actions">
        <button type="button" className="btn ghost" onClick={onDone}>{T('Cancel')}</button>
        <button type="submit" className="btn primary">{trip ? T('Save') : T('Create trip')}</button>
      </div>
    </form>
  );
}

export function JoinForm({ onDone }: { onDone?: () => void }) {
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState(store.state.me?.name || '');
  const [code, setCode] = useState(params.get('family') || store.state.family || '');
  const [color, setColor] = useState(store.state.me?.color || COLORS[0]);
  const submit = (e: FormEvent) => { e.preventDefault(); if (joinFamily(name, code, color)) onDone?.(); };
  return (
    <form className="join-form" onSubmit={submit}>
      <h2>{T('Join your family trip')}</h2>
      <p className="muted" dangerouslySetInnerHTML={{ __html: T('Everyone using the same <b>family code</b> sees the same notes and day plans, live.') }} />
      <label><span>{T('Your name')}</span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder={T('e.g. Mom, Erik, Grandpa')} autoFocus /></label>
      <label><span>{T('Family code')}</span><input value={code} onChange={(e) => setCode(e.target.value)} required pattern="[a-zA-Z0-9\-]{3,40}" maxLength={40} placeholder={T('e.g. svensson-thailand-2027')} /></label>
      <div className="color-row">
        {COLORS.map((c) => <button key={c} type="button" className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={`${T('Colour')} ${c}`} />)}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn ghost" onClick={() => setCode(randomCode())}>🎲 {T('New code')}</button>
        <button type="submit" className="btn primary">{T('Let’s go')}</button>
      </div>
    </form>
  );
}
