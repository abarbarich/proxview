import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTheme, loadThemePref, resolveTheme } from './store/ui';
import './index.css';

// Apply the resolved theme (system/dark/light) before first paint to avoid a flash.
applyTheme(resolveTheme(loadThemePref()));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
