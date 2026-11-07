// Entry point. Step 1–2: the desktop shell renders on every screen size (unchanged look) + PWA.
// Step 3/4 will pick a shell here: desktop (floating panels) or mobile (tab bar + sheets).
import './ui/desktop/styles.css';
import './ui/desktop/app.js';
import { initPwa } from './ui/pwa';

initPwa();
