import { useState, type FormEvent } from 'react';
import { PLACE, T, ago, countdown, directions, eta, fmtDist, fmtTime, km, store, type MeetStatus } from '../../../core';
import { ui, setUI, useTick } from '../ui-store';
import {
  copyText, createMeetup, ensureMe, fitFamily, focusMeetup, focusMember, focusNote, inviteLink, meetInTheMiddle,
  postNote, setSharing, shareText, startMode, addCustomStop, addStay, activeTrip, toast, cancelMode,
} from '../actions';
import { ArmedButton, Avatar, Ext } from './common';
import { Comment } from './Comments';

export function FamilyCard({ onJoin }: { onJoin: () => void }) {
  const s = store.state;
  if (!s.family || !s.me) {
    return (
      <div className="card">
        <h3>{T('Plan together')} 👨‍👩‍👧‍👦</h3>
        <p className="muted" style={{ fontSize: 14 }}>{T('Join a family with a shared code to comment on places, drop notes on the map and build day plans together — live.')}</p>
        <button className="btn primary" onClick={onJoin}>{T('Join or create a family')}</button>
      </div>
    );
  }
  const local = /^(localhost|127\.)/.test(location.hostname);
  return (
    <div className="card">
      <h3>{s.family}</h3>
      <p style={{ fontSize: 14, margin: 0 }}>{T('You are')} <b style={{ color: s.me.color }}>{s.me.name}</b> · {s.online
        ? <span style={{ color: 'var(--teal)' }}>● {T('live')}</span> : <span style={{ color: 'var(--saffron)' }}>● {T('this device only')}</span>}</p>
      <div className="members">{store.members().map(([n, c]) => <span className="member" key={n}><Avatar name={n} color={c} />{n}</span>)}</div>
      <div className="invite">
        <input readOnly value={inviteLink()} onFocus={(e) => e.target.select()} />
        <button className="btn small" onClick={() => copyText(inviteLink(), T('Invite link copied — send it to the family!'))}>{T('Copy invite')}</button>
      </div>
      {local && <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{T('This is a localhost link — family on the same Wi-Fi should use the network address shown in the terminal, or deploy the server (see README).')}</p>}
      <div style={{ marginTop: 10 }}><button className="btn small ghost" onClick={onJoin}>{T('Change name / family')}</button></div>
    </div>
  );
}

export function LiveCard() {
  useTick();
  const s = store.state;
  if (!s.family || !s.me) return null;
  const locs = Object.values(s.locations).sort((a, b) => Number(b.memberId === store.memberId) - Number(a.memberId === store.memberId) || b.ts - a.ts);
  const meets = store.activeMeetups();
  const me = store.myPos;
  return (
    <div className="card live">
      <div className="live-head"><h3>📡 {T('Where is everyone?')}</h3>
        <label className="switch"><input type="checkbox" checked={s.sharing} disabled={!s.online} onChange={(e) => setSharing(e.target.checked)} /><span className="track" /> {T('Share me')}</label></div>
      <p className="muted small">{s.sharing ? T('The family can see where you are while ThaiMap is open on this device.') : T('Turn on so the family can find you. Only shared while the app is open — never stored on disk.')}</p>
      {locs.length ? <div className="people">{locs.map((l) => {
        const d = me && l.memberId !== store.memberId ? km(me, l) : null;
        return (
          <div className="meet-row clickable" key={l.memberId} onClick={() => focusMember(l.memberId)}><Avatar name={l.name} color={l.color} />
            <div className="body"><b>{l.memberId === store.memberId ? T('You') : l.name}</b>
              <div className="muted">{Date.now() - l.ts > store.STALE ? '⚠️ ' + T('last seen') + ' ' : '🟢 '}{ago(l.ts)}{d !== null ? ` · ${T('{d} from you', { d: fmtDist(d) })}` : ''}</div></div></div>
        );
      })}</div> : <p className="muted small">{T('Nobody is sharing their location right now.')}</p>}
      <div className="detail-actions">
        {locs.length > 0 && <button className="btn small" onClick={fitFamily}>👀 {T('Show everyone')}</button>}
        {store.freshLocs().length > 1 && <button className="btn small" onClick={meetInTheMiddle}>🎯 {T('Meet in the middle')}</button>}
      </div>
      <h3 style={{ marginTop: 14 }}>🚩 {T('Meetup points')}</h3>
      {meets.length ? meets.map((m) => {
        const c: Record<string, number> = {}; Object.values(m.status).forEach((x) => { c[x.status] = (c[x.status] || 0) + 1; });
        const summary = (Object.keys(store.STATUS) as MeetStatus[]).filter((k) => c[k]).map((k) => `${store.STATUS[k][0]} ${c[k]}`).join(' · ') || T('no replies yet');
        return (
          <div className="meet-row clickable" key={m.id} onClick={() => focusMeetup(m.id)}><div className="flag-ico">🚩</div>
            <div className="body"><b>{m.title}</b><div className="muted">{m.at ? `${fmtTime(m.at)} · ${countdown(m.at)}` : T('no time set')} · {summary}</div></div></div>
        );
      }) : <p className="muted small">{T('If you split up, set a meetup point so everyone knows where to regroup.')}</p>}
      <div className="detail-actions"><button className="btn small accent" onClick={() => startMode('meet')}>🚩 {T('Set a meetup point')}</button></div>
    </div>
  );
}

export function Feed() {
  useTick();
  const items = [...store.state.notes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 80);
  if (!items.length) return <div className="empty" dangerouslySetInnerHTML={{ __html: T('No comments yet.<br/>Tap 📍 Note on the map, or comment on any place.') }} />;
  return (
    <div className="feed">
      {items.map((n) => {
        const root = n.parentId ? store.state.notes.find((x) => x.id === n.parentId) : null;
        const where = n.placeId ? `📍 ${PLACE[n.placeId]?.name || T('a place')}` : root ? `↩ ${T('reply to {who}', { who: root.author })}` : `📌 ${T('Note on the map')}`;
        return (
          <div key={n.id} className={`comment kind-${n.kind}`} onClick={() => focusNote(n.id)} role="button">
            <Avatar name={n.author} color={n.color} />
            <div className="body"><div className="who">{n.author}<time>{ago(n.createdAt)}</time></div>
              <div className="where">{where}</div><div className="txt">{n.text}</div></div>
          </div>
        );
      })}
    </div>
  );
}

// ── things opened from the map ──
export function MeetupDetail({ id, onClose }: { id: string; onClose?: () => void }) {
  useTick();
  const m = store.state.meetups.find((x) => x.id === id);
  if (!m) return null;
  const mine = m.status[store.memberId]?.status;
  const people = new Map<string, { name: string; color: string; status?: MeetStatus; loc?: { lat: number; lng: number } }>();
  Object.entries(m.status).forEach(([pid, s]) => people.set(pid, { name: s.name, color: s.color, status: s.status }));
  store.freshLocs().forEach((l) => { const p = people.get(l.memberId) || { name: l.name, color: l.color }; p.loc = l; people.set(l.memberId, p); });
  return (
    <div className="card meetup-card">
      <div className="detail-head"><h3>🚩 {m.title}</h3>{onClose && <button className="icon-btn" onClick={onClose} aria-label={T('Close')}>✕</button>}</div>
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>{m.at ? <><b>{fmtTime(m.at)}</b> · {countdown(m.at)}</> : T('No time set')} · {T('set by {who}', { who: m.createdBy })}</p>
      <div className="status-btns">{(Object.entries(store.STATUS) as [MeetStatus, [string, string]][]).map(([k, [i, l]]) => (
        <button key={k} className={'btn small' + (mine === k ? ' primary' : '')} onClick={() => ensureMe() && store.setMeetStatus(m.id, mine === k ? null : k)}>{i} {l}</button>
      ))}</div>
      <div className="meet-people">{[...people.entries()].map(([pid, p]) => {
        const d = p.loc ? km(p.loc, m) : null; const st = p.status ? store.STATUS[p.status] : null;
        return (<div className="meet-row" key={pid}><Avatar name={p.name} color={p.color} /><div className="body"><b>{pid === store.memberId ? T('You') : p.name}</b>
          <div className="muted">{st ? `${st[0]} ${st[1]}` : T('No reply yet')}{d !== null && p.status !== 'here' ? ` · ${T('{d} away', { d: fmtDist(d) })}${d > 0.06 ? ' · ' + eta(d) : ''}` : ''}</div></div></div>);
      })}{!people.size && <p className="muted" style={{ fontSize: 13 }}>{T('Nobody has replied yet.')}</p>}</div>
      <div className="detail-actions">
        <Ext className="btn small" href={directions(m.lat, m.lng, true)}>🧭 {T('Directions')}</Ext>
        <button className="btn small" onClick={() => shareText(`🚩 ${m.title}${m.at ? ' ' + T('at') + ' ' + fmtTime(m.at) : ''}\nhttps://maps.google.com/?q=${m.lat},${m.lng}`)}>📤 {T('Share')}</button>
        <ArmedButton onConfirm={async () => { if (await store.deleteMeetup(m.id)) { setUI({ focus: null }); onClose?.(); } }}>🗑 {T('Remove')}</ArmedButton>
      </div>
    </div>
  );
}

export function NoteDetail({ id, onClose }: { id: string; onClose?: () => void }) {
  const n = store.state.notes.find((x) => x.id === id);
  if (!n) return null;
  return (
    <div className="card note-card">
      <div className="detail-head"><h3>📌 {T('Note on the map')}</h3>{onClose && <button className="icon-btn" onClick={onClose} aria-label={T('Close')}>✕</button>}</div>
      <Comment n={n} />
    </div>
  );
}

/** Composer for things placed on the map: a note, a custom stop, a stay, or a meetup point. */
export function DraftComposer() {
  const d = ui.draft;
  const [title, setTitle] = useState(d?.title || '');
  const [time, setTime] = useState(d?.kind === 'meet' ? store.defaultMeetTime() : '');
  if (!d) return null;
  const done = () => setUI({ draft: null });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (d.kind === 'stop') { addCustomStop(title.trim() || T('Custom stop'), d, time); done(); }
    else if (d.kind === 'stay') { const t = activeTrip(); if (t) addStay(t, { dest: null, name: title.trim() || T('Stop'), lat: d.lat, lng: d.lng }); done(); }
    else if (d.kind === 'meet') createMeetup(title, time);
  };
  return (
    <div className="card draft-card">
      <div className="detail-head">
        <h3>{d.kind === 'note' ? '📍 ' + T('New family note') : d.kind === 'stop' ? '📌 ' + T('Custom stop') : d.kind === 'stay' ? '🧳 ' + T('New stop') : '🚩 ' + T('New meetup point')}</h3>
        <button className="icon-btn" onClick={() => { done(); cancelMode(); }} aria-label={T('Close')}>✕</button>
      </div>
      {d.kind === 'note' ? (
        <NoteDraft lat={d.lat} lng={d.lng} />
      ) : (
        <form className="compose" onSubmit={submit}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus required={d.kind !== 'meet'}
            placeholder={d.kind === 'stop' ? T('Name, e.g. Our hotel') : d.kind === 'stay' ? T('Name, e.g. Koh Kood') : T('e.g. Meet at the pier, In front of 7-Eleven')} />
          <div className="compose-row">
            {d.kind !== 'stay' && <label className="time-label">⏰ <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>}
            <button className={'btn small ' + (d.kind === 'meet' ? 'accent' : 'primary')} type="submit">
              {d.kind === 'meet' ? T('Set meetup') : d.kind === 'stay' ? T('Add stop') : T('Add')}</button>
          </div>
          {d.kind === 'meet' && <p className="muted" style={{ fontSize: 12, margin: 0 }}>{T('Everyone in the family gets notified.')}</p>}
        </form>
      )}
    </div>
  );
}
function NoteDraft({ lat, lng }: { lat: number; lng: number }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('note');
  const submit = async (e: FormEvent) => { e.preventDefault(); if (text.trim()) await postNote({ text: text.trim(), kind, lat, lng }); };
  return (
    <form className="compose" onSubmit={submit}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} required autoFocus placeholder={T('e.g. “Great ice cream here!” or “Meet here at 6 pm”')} />
      <div className="compose-row">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="note">📝 {T('Note')}</option><option value="idea">💡 {T('Idea')}</option><option value="warning">⚠️ {T('Heads-up')}</option><option value="love">❤️ {T('Must do!')}</option>
        </select>
        <button className="btn primary small" type="submit">{T('Post')}</button>
      </div>
    </form>
  );
}

/** Banner shown while the map waits for a tap. */
export function ModeBanner() {
  if (!ui.mode) return null;
  const txt = ui.mode === 'note' ? T('📍 Tap anywhere on the map to drop a family note') : ui.mode === 'meet' ? T('🚩 Tap the map where everyone should meet')
    : ui.mode === 'stay' ? T('🧳 Tap the map where you’ll stay') : T('📌 Tap the map to add a custom stop to “{name}”', { name: store.activePlan()?.name || T('a new day') });
  return <div className="mode-banner">{txt} <button onClick={cancelMode}>{T('Cancel')}</button></div>;
}

export { toast };
