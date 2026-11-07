// Leaflet + markercluster as ES modules. markercluster's UMD build attaches to a global `L`, so set it first.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

(window as unknown as { L: typeof L }).L = L;
await import('leaflet.markercluster');

export default L;
