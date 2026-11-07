import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/** Appearance and first-run state. Small enough for localStorage. */

export type ThemeMode = 'dark' | 'light' | 'system';

export interface Settings {
  theme: ThemeMode;
  accent: string;
  accentPreset: string;
  sidebarCollapsed: boolean;
  /** Set once the Launch Menu has been dismissed. */
  launchComplete: boolean;
}

export const ACCENT_PRESETS: Array<{ id: string; name: string; value: string }> = [
  { id: 'indigo', name: 'Indigo', value: '#6b8afd' },
  { id: 'mint', name: 'Mint', value: '#3ddc97' },
  { id: 'amber', name: 'Amber', value: '#f5b544' },
  { id: 'rose', name: 'Rose', value: '#f2688c' },
  { id: 'violet', name: 'Violet', value: '#a78bfa' },
  { id: 'teal', name: 'Teal', value: '#2dd4bf' },
];

const STORAGE_KEY = 'fnf-os.settings';

const DEFAULTS: Settings = {
  theme: 'dark',
  accent: ACCENT_PRESETS[0].value,
  accentPreset: ACCENT_PRESETS[0].id,
  sidebarCollapsed: false,
  launchComplete: false,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.replace('#', '').trim();
  if (/^[0-9a-f]{3}$/i.test(value)) {
    return {
      r: parseInt(value[0] + value[0], 16),
      g: parseInt(value[1] + value[1], 16),
      b: parseInt(value[2] + value[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(value)) {
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }
  return null;
}

function contrastFor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#0b0d11';
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return luminance > 0.45 ? '#0b0d11' : '#ffffff';
}

function resolvedTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

interface SettingsContextValue {
  settings: Settings;
  setTheme: (theme: ThemeMode) => void;
  setAccent: (value: string, presetId?: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  completeLaunch: () => void;
  resetAppearance: () => void;
  reopenLaunch: () => void;
  resolvedTheme: 'dark' | 'light';
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<Settings>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage may be unavailable in private mode; appearance still applies */
    }
  }, [settings]);

  const theme = resolvedTheme(settings.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;

    const rgb = hexToRgb(settings.accent);
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--accent-contrast', contrastFor(settings.accent));
    if (rgb) {
      root.style.setProperty('--accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`);
      root.style.setProperty('--accent-line', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.42)`);
    }

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0e0f12' : '#f5f6f9');
  }, [settings.accent, theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setSettings((prev) => ({ ...prev, theme: next }));
  }, []);

  const setAccent = useCallback((value: string, presetId = 'custom') => {
    setSettings((prev) => ({ ...prev, accent: value, accentPreset: presetId }));
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSettings((prev) => ({ ...prev, sidebarCollapsed: collapsed }));
  }, []);

  const completeLaunch = useCallback(() => {
    setSettings((prev) => ({ ...prev, launchComplete: true }));
  }, []);

  const reopenLaunch = useCallback(() => {
    setSettings((prev) => ({ ...prev, launchComplete: false }));
  }, []);

  const resetAppearance = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      theme: DEFAULTS.theme,
      accent: DEFAULTS.accent,
      accentPreset: DEFAULTS.accentPreset,
    }));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      setTheme,
      setAccent,
      setSidebarCollapsed,
      completeLaunch,
      resetAppearance,
      reopenLaunch,
      resolvedTheme: theme,
    }),
    [settings, setTheme, setAccent, setSidebarCollapsed, completeLaunch, resetAppearance, reopenLaunch, theme],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
