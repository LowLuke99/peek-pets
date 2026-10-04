// Pure logic for the "helpful powers": the phone's copy of the power list, local
// countdowns between PC updates, natural timer phrases, what the pet should be holding
// or wearing, and the cards/lines it shows for PC events. No DOM, no network.

export function initialPowers() {
  return Object.freeze({ list: [], byKey: {}, at: {} });
}

/** (state, server message, now ms) → state. Handles `powers` and `power_state`. */
export function powersReduce(s, m, now) {
  if (m.t === 'powers') {
    const byKey = {};
    const at = {};
    for (const p of m.list) { byKey[p.key] = p; at[p.key] = now; }
    return { list: m.list.map((p) => p.key), byKey, at };
  }
  if (m.t === 'power_state') {
    const p = s.byKey[m.key];
    if (!p) return s;
    return { ...s, byKey: { ...s.byKey, [m.key]: { ...p, state: m.state } }, at: { ...s.at, [m.key]: now } };
  }
  return s;
}

/** State of a power that is actually running (null otherwise). */
export function live(s, key) {
  const p = s.byKey[key];
  return p?.active && p.state ? p.state : null;
}

/** Seconds left, counting down locally from the last PC update. */
export function remaining(sec, at, now) {
  return Math.max(0, Math.ceil((sec ?? 0) - (now - (at ?? now)) / 1000));
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}

export function fmtDuration(sec) {
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

const UNIT = { h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, m: 60, min: 60, mins: 60, minute: 60, minutes: 60, s: 1, sec: 1, secs: 1, second: 1, seconds: 1 };
const FILLER = new Set(['in', 'for', 'timer', 'a', 'an', 'after', 'set', 'remind', 'me', 'and']);
export const TIMER_MIN_S = 5;
export const TIMER_MAX_S = 24 * 3600;

/** "pizza in 12 min" → {label:'Pizza', seconds:720}. A bare number means minutes. */
export function parseTimer(text) {
  const src = String(text ?? '').toLowerCase().trim();
  if (!src) return null;
  const re = /(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h|minutes|minute|mins|min|m|seconds|second|secs|sec|s)?(?![a-z])/g;
  let total = 0, found = false, lastUnit = null;
  const label = src.replace(re, (_, num, unit) => {
    found = true;
    const n = Number(num);
    const k = unit ? UNIT[unit] : lastUnit === 3600 ? 60 : 60; // "1h30" → 30 minutes
    total += n * k;
    lastUnit = k;
    return ' ';
  });
  if (!found) return null;
  const seconds = Math.round(total);
  if (seconds < TIMER_MIN_S || seconds > TIMER_MAX_S) return null;
  const words = label.split(/\s+/).filter((w) => w && !FILLER.has(w));
  const name = words.join(' ').slice(0, 40);
  return { label: name ? name[0].toUpperCase() + name.slice(1) : 'Timer', seconds };
}

/** What the pet should hold / wear / do right now, from the running powers. */
export function petCues(s, now) {
  const focus = live(s, 'focus');
  const media = live(s, 'media');
  const timers = live(s, 'timers')?.timers ?? [];
  const watches = live(s, 'watch')?.watches ?? [];
  const breaks = live(s, 'breaks');
  const drives = live(s, 'health')?.drives ?? [];
  const focusing = Boolean(focus?.running && remaining(focus.leftSec, s.at.focus, now) > 0);
  const playing = Boolean(media?.playing);
  const diskLow = drives.some((d) => d.level);
  const hand = focusing ? 'book' : timers.length ? 'timer' : watches.length ? 'hourglass' : null;
  const head = playing ? 'headphones' : diskLow ? 'bandage' : null;
  return { hand, head, bop: playing, tired: breaks?.tired ?? 0, focusing, diskLow, watching: watches.length > 0 };
}

/** Little live chips above the dock. */
export function trayItems(s, now) {
  const items = [];
  const focus = live(s, 'focus');
  if (focus?.running) {
    const left = remaining(focus.leftSec, s.at.focus, now);
    items.push({ key: 'focus', icon: 'focus', text: fmtClock(left), sub: 'focus', progress: focus.totalSec ? 1 - left / focus.totalSec : 0 });
  }
  const timers = (live(s, 'timers')?.timers ?? []).map((t) => ({ ...t, left: remaining(t.leftSec, s.at.timers, now) })).sort((a, b) => a.left - b.left);
  if (timers.length) {
    const t = timers[0];
    items.push({ key: 'timers', icon: 'timer', text: `${t.label} ${fmtClock(t.left)}`, sub: timers.length > 1 ? `+${timers.length - 1} more` : null, progress: t.totalSec ? 1 - t.left / t.totalSec : 0 });
  }
  const watches = live(s, 'watch')?.watches ?? [];
  if (watches.length) items.push({ key: 'watch', icon: 'watch', text: `Watching ${watches[0].label}`, sub: watches.length > 1 ? `+${watches.length - 1}` : null });
  const media = live(s, 'media');
  if (media?.playing && media.title) items.push({ key: 'media', icon: 'music', text: media.title, sub: media.artist ?? null });
  return items;
}

const HEALTH_ACTIONS = {
  open_storage: 'Storage Settings', open_cleanup: 'Disk Cleanup', open_taskmgr: 'Task Manager',
  space_hints: 'Where did it go?', open_downloads: 'Downloads', open_temp: 'Temp folder',
};

const BREAK_COPY = {
  eyes: { title: 'Eye break 👀', body: 'Look at something far away (about 6 m) for 20 seconds. I\'ll look with you.', seconds: 20 },
  stretch: { title: 'Stretch break 🙆', body: 'You\'ve been going a long while. Stand up, roll your shoulders, reach for the sky.' },
  water: { title: 'Water time 💧', body: 'Have a sip of water. Future you says thanks.' },
};

/**
 * A card for a power event the person might want to act on, or null.
 * Actions: {label, ack?: 'done'|'snooze'|'skip'|'dismiss', cmd?: {power, name, args}}.
 */
export function nudgeCard(key, ev, data) {
  const d = data ?? {};
  if (key === 'breaks' && ev === 'nudge') {
    const c = BREAK_COPY[d.kind] ?? BREAK_COPY.eyes;
    return {
      id: `breaks:${d.kind}`, key, kind: d.kind, title: c.title, body: c.body, seconds: c.seconds ?? 0, ttlMs: 5 * 60_000,
      actions: [{ label: 'Done', ack: 'done' }, { label: 'Snooze 10 min', ack: 'snooze' }, { label: 'Skip', ack: 'skip' }],
    };
  }
  if (key === 'focus' && ev === 'done') {
    return {
      id: 'focus:done', key, title: 'Focus done! 🎉', body: `${d.minutes ?? ''} minutes of focus. Take a 5-minute break?`, ttlMs: 3 * 60_000,
      actions: [{ label: 'Start 5-min break', ack: 'done', cmd: { power: 'timers', name: 'add', args: { label: 'Break', seconds: 300 } } }, { label: 'Not now', ack: 'dismiss' }],
    };
  }
  if (key === 'watch' && ev === 'done') {
    return { id: `watch:${d.id}`, key, title: `${d.label ?? 'It'} is done ✅`, body: d.text ?? 'Finished.', ttlMs: 10 * 60_000, actions: [{ label: 'Yay!', ack: 'done' }] };
  }
  if (key === 'timers' && ev === 'done') {
    return { id: `timers:${d.id}`, key, title: `⏰ ${d.label ?? 'Timer'}`, body: 'Time\'s up!', ttlMs: 10 * 60_000, alarm: true, actions: [{ label: 'Got it', ack: 'done' }] };
  }
  if (key === 'health' && ev === 'alert') {
    const actions = (Array.isArray(d.actions) ? d.actions : [])
      .filter((a) => typeof a === 'string' && Object.hasOwn(HEALTH_ACTIONS, a)).slice(0, 3)
      .map((a) => ({ label: HEALTH_ACTIONS[a], cmd: { power: 'health', name: a } }));
    return { id: `health:${d.kind}`, key, kind: d.kind, title: d.title ?? 'PC health', body: d.detail ?? '', ttlMs: 10 * 60_000, actions: [...actions, { label: 'Later', ack: 'dismiss' }] };
  }
  if (key === 'away' && ev === 'summary') {
    const items = Array.isArray(d.items) ? d.items.filter((i) => typeof i === 'string').slice(0, 6) : [];
    return {
      id: 'away:summary', key, title: 'Welcome back! 👋', body: `You were away ${d.awayMin ?? '?'} min.${items.length ? ' While you were gone:' : ''}`,
      items, ttlMs: 5 * 60_000, actions: [{ label: 'Thanks!', ack: 'done' }],
    };
  }
  return null;
}

/** Why a power isn't running (for the Powers screen). */
export function availability(entry, connected) {
  if (!connected || !entry) return 'needs-pc';
  if (!entry.allowed) return 'blocked';
  if (!entry.on) return 'off';
  return entry.active ? 'on' : 'starting';
}

/** A short speech-bubble line for a power event (or null to stay quiet). */
export function powerLine(key, ev, data) {
  const d = data ?? {};
  const k = `${key}.${ev}`;
  switch (k) {
    case 'breaks.break_done': return d.minutes >= 3 ? `Welcome back! Nice ${d.minutes}-minute break ♥` : null;
    case 'breaks.tired': return d.level === 2 ? '*yawn* Stretch soon?' : d.level === 1 ? "We've been at it a while…" : null;
    case 'breaks.nudge': return { eyes: 'Look far away with me! 👀', stretch: 'Stretch time!', water: 'Sip of water?' }[d.kind] ?? null;
    case 'focus.started': return 'Focus mode. I\'ll be quiet 🤫';
    case 'focus.done': return 'We did it! 🎉';
    case 'focus.stopped': return 'Taking a break? OK!';
    case 'media.playing': return 'Ooh, I like this one ♪';
    case 'watch.watching': return `I'll keep an eye on ${String(d.label ?? 'it').slice(0, 40)} 👀`;
    case 'watch.done': return `${String(d.label ?? 'It').slice(0, 50)} is done!`;
    case 'health.alert': return d.kind === 'disk' ? 'Ouch… the PC is running out of room.' : d.kind === 'heat' ? 'Phew, the PC is hot!' : 'The PC is working really hard…';
    case 'handoff.received': return d.kind === 'photo' ? 'Photo delivered! 📸' : 'Sent to your PC! ✈️';
    case 'quick.locking': return 'Bye for now! 👋';
    case 'timers.done': return `⏰ ${String(d.label ?? 'Timer').slice(0, 40)}!`;
    case 'away.summary': return 'Welcome back!';
    default: return null;
  }
}
