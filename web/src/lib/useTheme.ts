import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'libresesh.theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

// Private windows and blocked site data throw on storage access, so every read
// and write is guarded — the app must still render when persistence is gone.
function readStored(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Storage unavailable — fall through to the default.
  }
  return 'system';
}

function writeStored(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Nothing to persist; the choice lasts only for this session.
  }
}

function prefersDark(): boolean {
  try {
    return window.matchMedia(MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

export interface ThemeControl {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/** Theme choice with persistence; follows the OS while set to `'system'`. */
export function useTheme(): ThemeControl {
  const [theme, setThemeState] = useState<Theme>(readStored);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    // Pick up a mid-session OS switch while tracking the system preference.
    const mq = window.matchMedia(MEDIA_QUERY);
    const onChange = (): void => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    writeStored(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
