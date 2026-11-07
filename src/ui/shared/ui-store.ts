// View state shared by both shells (what is selected, filters, map mode) + React hooks over core & view state.
import { useSyncExternalStore } from 'react';
import { CATEGORIES, Emitter, store, type Template } from '../../core';

export type MapMode = null | 'note' | 'stop' | 'stay' | 'meet';
export type Focus = { type: 'note' | 'meetup' | 'member'; id: string } | null;

export interface UIState {
  cats: Set<string>;
  region: string;
  query: string;
  selected: string | null;          // place id shown in detail
  preview: Template | null;         // ready-made day previewed on the map
  mode: MapMode;                    // waiting for a tap on the map
  tplType: string;
  openReplies: Set<string>;
  view: 'trip' | 'day';             // plan tab: trip overview or one day open
  openIdeas: Set<string>;           // stays with their ideas list expanded
  focus: Focus;                     // map note / meetup / member opened from the map
  draft: { kind: 'note' | 'stop' | 'stay' | 'meet'; lat: number; lng: number; title?: string; placeId?: string } | null;
  dialog: null | 'join' | 'trip' | 'trip-edit';
}

export const ui: UIState = {
  cats: new Set(Object.keys(CATEGORIES)),
  region: 'all', query: '',
  selected: null, preview: null, mode: null, tplType: 'all',
  openReplies: new Set(), view: 'trip', openIdeas: new Set(),
  focus: null, draft: null, dialog: null,
};

const bus = new Emitter<{ change: void }>();
let version = 0;
const bump = () => { version++; bus.emit('change', undefined); };

/** Update view state and re-render. */
export function setUI(patch: Partial<UIState>): void { Object.assign(ui, patch); bump(); }
/** Re-render after mutating ui sets in place. */
export const touchUI = bump;

// every core store event also re-renders the views
(['all', 'notes', 'plans', 'live', 'meetups', 'sharing', 'conn'] as const).forEach((e) => store.on(e, bump));

const subscribe = (fn: () => void) => bus.on('change', fn);
/** Re-render on any core or view change. Core state mutates in place, so we track a version number. */
export function useApp(): number { return useSyncExternalStore(subscribe, () => version); }

/** Clock tick (for "5 min ago", countdowns, stale markers). */
let tick = 0;
const tickBus = new Emitter<{ t: void }>();
setInterval(() => { tick++; tickBus.emit('t', undefined); }, 30000);
export function useTick(): number { return useSyncExternalStore((fn) => tickBus.on('t', fn), () => tick); }

export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };
