import { create } from 'zustand';

const COLS_KEY = 'proxview.columns';
const THEME_KEY = 'proxview.theme';
const SIDEBAR_KEY = 'proxview.sidebar';

/** What the user picked. "system" tracks the OS setting. */
export type ThemePref = 'system' | 'dark' | 'light';
/** The resolved theme actually applied to the document. */
export type Theme = 'dark' | 'light';

function loadColumns(): number {
  const v = Number(localStorage.getItem(COLS_KEY));
  return v === 2 || v === 4 ? v : 2;
}

function loadCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function systemTheme(): Theme {
  return darkQuery.matches ? 'dark' : 'light';
}

export function loadThemePref(): ThemePref {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function resolveTheme(pref: ThemePref): Theme {
  return pref === 'system' ? systemTheme() : pref;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

interface UiState {
  columns: number;
  themePref: ThemePref;
  theme: Theme;
  sidebarCollapsed: boolean;
  setColumns: (n: number) => void;
  setThemePref: (pref: ThemePref) => void;
  toggleSidebar: () => void;
}

export const useUi = create<UiState>((set, get) => ({
  columns: loadColumns(),
  themePref: loadThemePref(),
  theme: resolveTheme(loadThemePref()),
  sidebarCollapsed: loadCollapsed(),
  setColumns: (n) => {
    localStorage.setItem(COLS_KEY, String(n));
    set({ columns: n });
  },
  setThemePref: (pref) => {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
    const theme = resolveTheme(pref);
    applyTheme(theme);
    set({ themePref: pref, theme });
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
    set({ sidebarCollapsed: next });
  },
}));

// Track the OS theme live while the preference is "system".
darkQuery.addEventListener('change', () => {
  if (useUi.getState().themePref !== 'system') return;
  const theme = systemTheme();
  applyTheme(theme);
  useUi.setState({ theme });
});
