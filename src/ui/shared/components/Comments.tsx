import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { T, ago, store, type Note } from '../../../core';
import { KINDS } from '../constants';
import { ui } from '../ui-store';
import { deleteNote, postNote, toggleReply } from '../actions';
import { Avatar } from './common';

export function Composer({ placeId = null, parentId = null, lat = null, lng = null, placeholder = T('Write something for the family…'), autoFocus = false, onDone }:
  { placeId?: string | null; parentId?: string | null; lat?: number | null; lng?: number | null; placeholder?: string; autoFocus?: boolean; onDone?: () => void }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('note');
  const [busy, setBusy] = useState(false);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await postNote({ text: text.trim(), kind, placeId, parentId, lat, lng });
    setBusy(false);
    if (ok) { setText(''); onDone?.(); }
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); submit(); } };
  return (
    <form className="compose" onSubmit={submit}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} required maxLength={2000} rows={2} placeholder={placeholder} autoFocus={autoFocus} />
      <div className="compose-row">
        {!parentId && <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KINDS).map(([k, [i, l]]) => <option key={k} value={k}>{i} {l}</option>)}
        </select>}
        <button className="btn primary small" type="submit" disabled={busy}>{parentId ? T('Reply') : T('Post')}</button>
      </div>
    </form>
  );
}

const repliesOf = (id: string) => store.state.notes.filter((n) => n.parentId === id).sort((a, b) => a.createdAt - b.createdAt);

export function Comment({ n, withReplies = true }: { n: Note; withReplies?: boolean }) {
  const mine = store.state.me && n.author === store.state.me.name;
  const replies = withReplies ? repliesOf(n.id) : [];
  return (
    <div className={`comment kind-${n.kind}`}>
      <Avatar name={n.author} color={n.color} />
      <div className="body">
        <div className="who">{n.author}<time>{ago(n.createdAt)}</time></div>
        <div className="txt">{n.text}</div>
        <div className="acts">
          {withReplies && <button className="icon-btn" onClick={() => toggleReply(n.id)}>↩ {T('Reply')}</button>}
          {mine && <button className="icon-btn" onClick={() => deleteNote(n.id)}>🗑 {T('Delete')}</button>}
        </div>
        {replies.length > 0 && <div className="replies">{replies.map((r) => <Comment key={r.id} n={r} withReplies={false} />)}</div>}
        {withReplies && ui.openReplies.has(n.id) && <Composer parentId={n.id} placeId={n.placeId} placeholder={T('Reply…')} autoFocus />}
      </div>
    </div>
  );
}

export function PlaceThread({ placeId, placeName }: { placeId: string; placeName: string }) {
  const roots = store.state.notes.filter((n) => n.placeId === placeId && !n.parentId).sort((a, b) => a.createdAt - b.createdAt);
  const count = store.state.notes.filter((n) => n.placeId === placeId).length;
  return (
    <div className="thread">
      <h5>💬 {T('Family comments')} {roots.length > 0 && `(${count})`}</h5>
      {roots.length ? roots.map((n) => <Comment key={n.id} n={n} />) : <p className="muted" style={{ fontSize: 13 }}>{T('No comments yet — be the first!')}</p>}
      <Composer placeId={placeId} placeholder={T('What do you think about {name}?', { name: placeName })} />
    </div>
  );
}
