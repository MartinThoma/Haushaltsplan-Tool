import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { putDataset } from './state/datasets.ts';
import { restoreFiles } from './state/uploads.ts';
import './index.css';

// Activates a new version as soon as it is deployed and reloads into it; opened files survive
// the reload because they are restored from sessionStorage below.
registerSW({ immediate: true });

const restored = restoreFiles();
for (const { upload, dataset } of restored.files) putDataset(upload.entry.id, dataset);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App restored={restored} />
  </StrictMode>,
);
