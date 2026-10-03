// Human-friendly text for PC facts and link state. Unavailable data is stated
// plainly ("no battery") rather than hidden or guessed.

export function batteryText(v) {
  if (!v) return null;
  if (!v.available) return v.reason === 'no_battery' ? 'No battery (desktop PC)' : 'Battery unknown';
  const pct = v.percent == null ? '?' : `${v.percent}%`;
  return `${pct}${v.charging ? ' · charging' : v.pluggedIn ? ' · plugged in' : ''}${v.saver ? ' · saver' : ''}`;
}

export function activityText(v) {
  if (!v?.available) return null;
  const s = v.idleSec ?? 0;
  if (s < 30) return 'Active now';
  if (s < 90) return 'Idle for a moment';
  const m = Math.round(s / 60);
  return m < 60 ? `Away ${m} min` : `Away ${Math.round(m / 60)} h`;
}

export function loadText(v) {
  if (!v?.available) return null;
  const parts = [];
  if (v.cpu != null) parts.push(`CPU ${v.cpu}%`);
  if (v.memory != null) parts.push(`RAM ${v.memory}%`);
  return parts.join(' · ') || 'Measuring…';
}

export function factText(key, value) {
  switch (key) {
    case 'battery': return batteryText(value);
    case 'activity': return activityText(value);
    case 'load': return loadText(value);
    default: return value && typeof value === 'object' ? JSON.stringify(value).slice(0, 40) : null;
  }
}

/** The small chip under the status: only shows things worth glancing at. */
export function factChip(facts) {
  const b = facts?.battery;
  if (b?.available && b.percent != null) {
    if (b.charging) return `PC charging · ${b.percent}%`;
    if (b.percent <= 20) return `PC battery low · ${b.percent}%`;
  }
  return null;
}

export function ms(v) {
  return v == null ? '–' : `${Math.round(v)} ms`;
}
