// ThaiMap data model — shared by every view (desktop shell, mobile shell, server contract).

export type CategoryId = 'mustsee' | 'beach' | 'island' | 'hiking' | 'hotel' | 'food' | 'airport';
export type IATA = string;
export type ISODate = string; // 'YYYY-MM-DD'

export interface LatLng { lat: number; lng: number }

export interface Category { label: string; icon: string; color: string }
export interface Region { label: string; center: [number, number]; zoom: number }

export interface Place extends LatLng {
  id: string;
  cat: CategoryId | string;
  region: string;
  name: string;
  desc?: string;
  tip?: string;
  duration?: string;
  difficulty?: string;
  price?: number;        // 1 budget … 4 luxury
  iata?: IATA;
  intl?: boolean;
}

export interface TemplateStop { place: string; time?: string; note?: string }
export interface Template {
  id: string;
  type: 'city' | 'islands' | 'hiking' | string;
  name: string;
  region: string;
  blurb: string;
  stops: TemplateStop[];
}

export interface Destination extends LatLng {
  id: string;
  name: string;
  region: string;
  airport: IATA | null;
  transfer: string;
}

export interface IntlFares {
  origins: IATA[];
  to: Record<IATA, { low: [number, number]; high: [number, number] }>;
}

// ── family data (synced through the server, or kept on-device) ──
export interface Me { name: string; color: string }

export type NoteKind = 'note' | 'idea' | 'warning' | 'love';
export interface Note {
  id: string;
  text: string;
  kind: NoteKind | string;
  author: string;
  color: string;
  placeId: string | null;
  parentId: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: number;
}

export interface Stop {
  id: string;
  place?: string | null;   // PLACES id, or a custom stop with name + coords
  name?: string;
  lat?: number | null;
  lng?: number | null;
  time: string;
  note: string;
}

export interface DayPlan {
  id: string;
  name: string;
  date: ISODate | '';
  type: string;
  stops: Stop[];
  tripId?: string | null;
  rev?: string;
  updatedBy?: string;
  updatedAt?: number;
}

export type FlightKind = 'out' | 'home' | 'domestic';
export interface Flight {
  id: string;
  kind: FlightKind;
  from: IATA;
  to: IATA;
  date: ISODate;
  arrDate?: ISODate | '';
  dep: string;
  arr: string;
  flightNo: string;
  note?: string;
}

export interface Stay {
  id: string;
  dest: string | null;     // DESTINATIONS id, or null for a spot picked on the map
  name: string;
  lat: number | null;
  lng: number | null;
  nights: number;
}

export interface Trip {
  id: string;
  name: string;
  start: ISODate;
  days: number;
  travellers: number;
  home: IATA;
  flights: Flight[];
  stays: Stay[];
  rev?: string;
  updatedBy?: string;
  updatedAt?: number;
}

export type MeetStatus = 'coming' | 'late' | 'here' | 'cant';
export interface Meetup extends LatLng {
  id: string;
  title: string;
  at: number | null;
  placeId: string | null;
  createdBy: string;
  color: string;
  createdAt: number;
  status: Record<string, { status: MeetStatus; name: string; color: string; ts?: number }>;
}

export interface MemberLocation extends LatLng {
  memberId: string;
  name: string;
  color: string;
  acc: number;
  ts: number;
}

export interface FamilySnapshot {
  code: string;
  notes: Note[];
  plans: DayPlan[];
  trips?: Trip[];
  meetups?: Meetup[];
  locations?: MemberLocation[];
}

export type ServerEvent =
  | { type: 'note:add'; note: Note }
  | { type: 'note:delete'; ids: string[] }
  | { type: 'plan:put'; plan: DayPlan }
  | { type: 'plan:delete'; id: string }
  | { type: 'trip:put'; trip: Trip }
  | { type: 'trip:delete'; id: string }
  | { type: 'loc:put'; loc: MemberLocation }
  | { type: 'loc:delete'; memberId: string }
  | { type: 'meetup:put'; meetup: Meetup }
  | { type: 'meetup:delete'; id: string };

export interface DataTranslations {
  categories?: Record<string, string>;
  regions?: Record<string, string>;
  places?: Record<string, Partial<Pick<Place, 'desc' | 'tip' | 'duration' | 'difficulty'>>>;
  templates?: Record<string, { name?: string; blurb?: string; notes?: string[] }>;
  destinations?: Record<string, { transfer?: string }>;
}
