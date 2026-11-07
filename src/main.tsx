import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './lib/pwa';
import { registerInstallPromptListener } from './lib/platform';
import './styles/app.css';

registerInstallPromptListener();
registerServiceWorker();

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
