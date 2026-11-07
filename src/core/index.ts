// Public surface of the shared core — what every view (desktop, mobile) builds on.
export * from './model';
export * from './data/catalog';
export { LANG, LOCALE, T, setLang } from './i18n';
export * from './util';
export * from './format';
export * from './domain/places';
export * from './domain/trip';
export * from './domain/links';
export * as store from './store';
