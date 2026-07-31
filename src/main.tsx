import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
// Bundled rather than loaded from a CDN so the map still renders offline,
// which is the whole point of installing this app before a trip.
import 'leaflet/dist/leaflet.css';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
