// PWA glue shared by every shell: service-worker registration, "new version" prompt, install button.
import { registerSW } from 'virtual:pwa-register';
import { T } from '../core';

function banner(html: string, actions: { label: string; primary?: boolean; run: () => void }[], ttl = 0) {
  document.querySelector('.pwa-banner')?.remove();
  const el = document.createElement('div');
  el.className = 'pwa-banner glass';
  el.innerHTML = `<span>${html}</span>`;
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'btn small' + (a.primary ? ' primary' : '');
    b.textContent = a.label;
    b.onclick = () => { el.remove(); a.run(); };
    el.append(b);
  });
  document.body.append(el);
  if (ttl) setTimeout(() => el.remove(), ttl);
}

export function initPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      banner(T('A new version is ready'), [{ label: T('Update'), primary: true, run: () => updateSW(true) }, { label: '✕', run: () => {} }]);
    },
    onOfflineReady() { banner(T('Ready to use offline ✓'), [{ label: '✕', run: () => {} }], 5000); },
  });

  // Install: Chrome/Edge/Android give us an install prompt; iOS Safari needs "Share → Add to Home Screen".
  const btn = document.getElementById('installBtn') as HTMLButtonElement | null;
  if (!btn) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
  if (standalone) return;
  btn.title = T('Install app');
  let deferred: (Event & { prompt: () => Promise<void> }) | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as Event & { prompt: () => Promise<void> };
    btn.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => btn.classList.add('hidden'));
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) btn.classList.remove('hidden');
  btn.addEventListener('click', async () => {
    if (deferred) { await deferred.prompt(); deferred = null; btn.classList.add('hidden'); }
    else banner(T('Install ThaiMap on your phone: tap Share, then “Add to Home Screen”.'), [{ label: '✕', run: () => {} }], 12000);
  });
}
