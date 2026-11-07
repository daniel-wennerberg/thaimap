import { T } from '../../core';

export const COLORS = ['#0f766e', '#ea580c', '#7c3aed', '#db2777', '#2563eb', '#ca8a04', '#16a34a', '#475569'];
export const KINDS: Record<string, [string, string]> = {
  note: ['📝', T('Note')], idea: ['💡', T('Idea')], warning: ['⚠️', T('Heads-up')], love: ['❤️', T('Must do!')],
};
export const TPL_TYPES: Record<string, string> = {
  all: T('All'), city: T('🏙️ City days'), islands: T('🚤 Island hopping'), hiking: T('🥾 Hiking'),
};
export const isMapNote = (n: { placeId: string | null; parentId: string | null; lat: number | null; lng: number | null }) =>
  !n.placeId && !n.parentId && n.lat != null && n.lng != null;
