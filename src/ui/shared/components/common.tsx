import { useEffect, useRef, useState, type ReactNode } from 'react';
import { T, store, type StayLinks } from '../../../core';
import { toasts } from '../actions';
import { useApp } from '../ui-store';

export const Avatar = ({ name, color, size }: { name: string; color: string; size?: number }) => (
  <div className="avatar" style={{ background: color, ...(size ? { width: size, height: size, fontSize: size * 0.43 } : {}) }}>
    {(name || '?').trim()[0]?.toUpperCase() || '?'}
  </div>
);

/** A destructive button that needs a second tap within 2.5 s. */
export function ArmedButton({ onConfirm, className = 'btn small danger', children }: { onConfirm: () => void; className?: string; children: ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 2500); return () => clearTimeout(t); }, [armed]);
  return <button type="button" className={className} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
    {armed ? T('Tap again to confirm') : children}
  </button>;
}

export function Toasts() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => toasts.on('toast', (t) => {
    setMsg(t); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(null), 2600);
  }), []);
  return <div className={'toast' + (msg ? ' show' : '')} role="status" aria-live="polite">{msg}</div>;
}

export function ConnBanner({ className = '' }: { className?: string }) {
  useApp();
  const [msg, setMsg] = useState(store.connMessage());
  useEffect(() => store.on('conn', setMsg), []);
  useEffect(() => store.on('all', () => setMsg(store.connMessage())), []);
  return msg ? <div className={'conn-banner ' + className}>{msg}</div> : null;
}

export const Ext = ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
  <a href={href} target="_blank" rel="noopener" className={className}>{children}</a>;

export const StayLinkRow = ({ u }: { u: StayLinks }) => (
  <div className="link-row">
    <span>🛏️</span><Ext href={u.booking}>Booking</Ext><Ext href={u.agoda}>Agoda</Ext>
    <span>🎟️</span><Ext href={u.getyourguide}>GetYourGuide</Ext><Ext href={u.klook}>Klook</Ext><Ext href={u.viator}>Viator</Ext>
  </div>
);

/** Small segmented "Back" header used inside stacks (mobile sheet, desktop panel). */
export const BackBar = ({ title, onBack, right }: { title?: ReactNode; onBack: () => void; right?: ReactNode }) => (
  <div className="back-bar">
    <button type="button" className="btn small" onClick={onBack}>‹ {T('Back')}</button>
    {title && <div className="back-title">{title}</div>}
    <div>{right}</div>
  </div>
);
