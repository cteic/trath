import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { createTauriBackend } from './platform/tauri-backend';

import './app.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('The page has no #root element.');
}

const backend = createTauriBackend();

createRoot(root).render(
  <StrictMode>
    <App backend={backend} />
  </StrictMode>,
);
