import { useEffect, useRef, useState } from 'react';
import { T, addDays, fmtDay, nf, tripDays, flightOf, intlFare, PLACES, REGIONS, store } from '../../core';
import { MapController, placeInList, type Insets } from '../map/MapController';
import { ui, useApp } from './ui-store';
import { setMap, selectPlace, focusNote, focusMeetup, focusMember, focusStay, mapTapped, setTab, activeTrip } from './actions';

/** Mounts the shared map in `ref`, wires its events to the shared actions and re-renders it on every change. */
export function useMapController(insets: () => Insets, controls: 'full' | 'minimal' = 'full') {
  const ref = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<MapController | null>(null);
  const insetsRef = useRef(insets); insetsRef.current = insets;
  const version = useApp();

  useEffect(() => {
    const c = new MapController(ref.current!, { insets: () => insetsRef.current(), controls });
    setMap(c); setCtl(c);
    const offs = [
      c.events.on('place', (id) => selectPlace(id, { fly: false })),
      c.events.on('note', focusNote),
      c.events.on('meetup', focusMeetup),
      c.events.on('member', (id) => { setTab('family'); focusMember(id); }),
      c.events.on('stay', (id) => { const t = activeTrip(); if (t) focusStay(t, id); }),
      c.events.on('tap', mapTapped),
    ];
    requestAnimationFrame(() => c.fitThailand(false));
    const onResize = () => c.invalidate();
    window.addEventListener('resize', onResize);
    return () => { offs.forEach((o) => o()); window.removeEventListener('resize', onResize); c.map.remove(); setMap(null); };
  }, []);

  useEffect(() => { ctl?.render(); }, [ctl, version]);
  return { ref, ctl };
}

export interface HudStat { label: string; value: string; small?: string; sub?: string; color: string }
/** Title + key numbers shown over the map (big on desktop, compact on mobile). */
export function hudData(): { kicker: string; title: string; stats: HudStat[] } {
  const trip = activeTrip();
  if (trip) {
    const { days, diff } = tripDays(trip);
    const planned = days.filter((d) => store.dayPlan(trip, d.date)?.stops.length).length;
    const out = flightOf(trip, 'out');
    const fare = out ? intlFare(trip.home, out.to, out.date) : null;
    const stats: HudStat[] = [
      { label: T('Days'), value: String(trip.days), small: T('{n} planned', { n: planned }), color: '#2dd4bf' },
      { label: T('Stops'), value: String(trip.stays.length), small: T('{n} nights', { n: trip.stays.reduce((t, s) => t + s.nights, 0) }),
        sub: diff ? `⚠️ ${T(diff > 0 ? '{n} nights not planned yet' : '{n} nights too many', { n: Math.abs(diff) })}` : '', color: '#fb923c' },
    ];
    if (fare) stats.push({ label: T('Flights'), value: `${nf(fare.lo * trip.travellers / 1000)}–${nf(fare.hi * trip.travellers / 1000)}`, small: 'k SEK', sub: `${trip.travellers} × ${fare.season}`, color: '#a78bfa' });
    return {
      kicker: `${T('Trip')} · ${fmtDay(trip.start, { day: 'numeric', month: 'short' })} – ${fmtDay(addDays(trip.start, trip.days - 1), { day: 'numeric', month: 'short', year: 'numeric' })}`,
      title: trip.name, stats,
    };
  }
  const live = Object.values(store.state.locations).filter((l) => Date.now() - l.ts < store.STALE).length;
  const stats: HudStat[] = [{ label: T('Places'), value: String(PLACES.filter(placeInList).length), color: '#2dd4bf' }];
  if (store.state.family) {
    stats.push({ label: T('Family online'), value: String(live), color: '#a78bfa' });
    stats.push({ label: T('Meetups'), value: String(store.activeMeetups().length), color: '#fb923c' });
  }
  return { kicker: T('Explore'), title: ui.region === 'all' ? 'Thailand' : REGIONS[ui.region].label, stats };
}
