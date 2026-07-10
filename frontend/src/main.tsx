import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTheme, loadTheme } from './store/ui';
import './index.css';

// Apply the saved theme before first paint to avoid a flash.
applyTheme(loadTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
