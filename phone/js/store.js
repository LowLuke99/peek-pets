// localStorage wrapper. Storage can be unavailable (private mode, blocked site data),
// so every access is guarded and the app keeps working with in-memory fallbacks.

const PREFIX = 'peekpets.';
const memory = new Map();

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const store = {
  get(key, fallback = null) {
    const raw = safe(() => localStorage.getItem(PREFIX + key), null) ?? memory.get(key) ?? null;
    if (raw == null) return fallback;
    return safe(() => JSON.parse(raw), fallback);
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    memory.set(key, raw);
    safe(() => localStorage.setItem(PREFIX + key, raw));
  },
  remove(key) {
    memory.delete(key);
    safe(() => localStorage.removeItem(PREFIX + key));
  },
};

export const DEFAULT_SETTINGS = Object.freeze({
  pet: 'mochi',
  gazeMode: 'mirror',
  screens: 'all',
  reducedMotion: safe(() => matchMedia('(prefers-reduced-motion: reduce)').matches, false),
  sound: true,
  debug: false,
  demo: false,
  awake: false,
  look: 'auto', // auto | clay (WebGL) | classic (2D)
  motion: false, // shake & tilt (iOS asks permission when switched on)
});

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(store.get('settings') ?? {}) };
}

export function saveSettings(settings) {
  store.set('settings', settings);
}
