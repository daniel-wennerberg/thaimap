// Entry point: picks the view shell for this device and renders it. Both shells share src/core and src/ui/shared.
//   mobile  → phones (and small touch tablets): full-screen map, bottom sheet, tab bar
//   desktop → everything else: floating glass panels over the map
// Force one with ?shell=mobile / ?shell=desktop (remembered), or ?shell=auto to reset.
import { StrictMode, useEffect, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, T } from './core';
import { initPwa } from './ui/pwa';
import './ui/shared/base.css';

const q = new URLSearchParams(location.search).get('shell');
if (q === 'auto') LS.set('shell', null); else if (q === 'mobile' || q === 'desktop') LS.set('shell', q);
const forced = LS.get<string | null>('shell', null);
const mq = matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1024px)');
const shell = forced === 'mobile' || forced === 'desktop' ? forced : mq.matches ? 'mobile' : 'desktop';
// switching device class (e.g. rotating a tablet, resizing a window across the breakpoint) reloads into the other shell
if (!forced) mq.addEventListener('change', () => location.reload());

document.documentElement.dataset.shell = shell;
document.title = T('ThaiMap — Family Trip Planner');
const mod: { default: ComponentType } = shell === 'mobile' ? await import('./ui/mobile/MobileApp') : await import('./ui/desktop/DesktopApp');
if (shell === 'mobile') await import('./ui/mobile/mobile.css');

function Boot({ App }: { App: ComponentType }) {
  useEffect(() => { initPwa(); }, []);
  return <App />;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Boot App={mod.default} /></StrictMode>);
