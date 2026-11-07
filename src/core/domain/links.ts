// Outbound search links (no booking inside the app — these open a ready-made search).
import type { IATA, ISODate, Stay, Trip } from '../model';
import { LANG } from '../i18n';
import { addDays } from '../util';
import { stayPlaceName } from './trip';

const yymmdd = (iso: ISODate) => iso.slice(2).replaceAll('-', '');

export const googleFlights = (from: IATA, to: IATA, date: ISODate, ret?: ISODate | null) =>
  `https://www.google.com/travel/flights?hl=${LANG}&curr=SEK&q=${encodeURIComponent(`Flights from ${from} to ${to} on ${date}${ret ? ' returning ' + ret : ''}`)}`;

export const skyscanner = (from: IATA, to: IATA, date: ISODate, ret: ISODate | null | undefined, adults: number) =>
  `https://www.skyscanner.se/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${yymmdd(date)}/${ret ? yymmdd(ret) + '/' : ''}?adults=${adults}`;

export interface StayLinks { booking: string; agoda: string; getyourguide: string; klook: string; viator: string }

/** Hotel and tour searches for the nights you stay at a stop. */
export function stayLinks(trip: Trip, s: Stay, range: { from: number; to: number }): StayLinks {
  const q = encodeURIComponent(stayPlaceName(s) + (s.dest ? '' : ' Thailand'));
  const ci = addDays(trip.start, range.from), co = addDays(trip.start, range.to);
  const n = trip.travellers;
  return {
    booking: `https://www.booking.com/searchresults.html?ss=${q}%2C%20Thailand&checkin=${ci}&checkout=${co}&group_adults=${n}&no_rooms=1`,
    agoda: `https://www.agoda.com/search?textToSearch=${q}&checkIn=${ci}&checkOut=${co}&adults=${n}&rooms=1`,
    getyourguide: `https://www.getyourguide.com/s/?q=${q}&date_from=${ci}&date_to=${co}`,
    klook: `https://www.klook.com/search/result/?query=${q}`,
    viator: `https://www.viator.com/searchResults/all?text=${q}`,
  };
}

export const directions = (lat: number, lng: number, walking = false) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}${walking ? '&travelmode=walking' : ''}`;
export const placeSearch = (name: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' Thailand')}`;
