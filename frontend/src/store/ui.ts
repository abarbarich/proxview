import { create } from 'zustand';

const COLS_KEY = 'proxview.columns';
const THEME_KEY = 'proxview.theme';
const SIDEBAR_KEY = 'proxview.sidebar';

export type Theme = 'dark' | 'light';

function loadColumns(): number {
  const v = Number(localStorage.getItem(COLS_KEY));
  return v >= 1 && v <= 4 ? v : 3;
}

function loadCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
}

export function loadTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

interface UiState {
  columns: number;
  theme: Theme;
  sidebarCollapsed: boolean;
  setColumns: (n: number) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
}

export const useUi = create<UiState>((set, get) => ({
  columns: loadColumns(),
  theme: loadTheme(),
  sidebarCollapsed: loadCollapsed(),
  setColumns: (n) => {
    localStorage.setItem(COLS_KEY, String(n));
    set({ columns: n });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    set({ theme: next });
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
    set({ sidebarCollapsed: next });
  },
}));
