// Phone side of the Peek Pets live-link protocol (see docs/PROTOCOL.md).
// Every inbound message is validated here so the rest of the app can trust shapes.

export const PROTOCOL_VERSION = 1;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const unit = (v) => finite(v) && v >= 0 && v <= 1;
const str = (v, max = 200) => typeof v === 'string' && v.length <= max;

/** @returns {object|null} a validated message, or null if it should be ignored. */
export function parseServerMessage(text) {
  if (typeof text !== 'string' || text.length > 64 * 1024) return null;
  let m;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return null;

  switch (m.t) {
    case 'c':
      if (!unit(m.x) || !unit(m.y) || !finite(m.s) || !finite(m.ts)) return null;
      return {
        t: 'c', x: m.x, y: m.y, s: m.s, ts: m.ts,
        m: finite(m.m) ? m.m : 0,
        mx: unit(m.mx) ? m.mx : m.x,
        my: unit(m.my) ? m.my : m.y,
      };
    case 'hello':
      return finite(m.v) ? { t: 'hello', v: m.v, version: str(m.version, 32) ? m.version : '?', ts: finite(m.ts) ? m.ts : 0 } : null;
    case 'auth_ok':
      return {
        t: 'auth_ok',
        token: str(m.token, 128) ? m.token : null,
        deviceId: str(m.deviceId, 64) ? m.deviceId : null,
        pc: str(m.pc, 64) ? m.pc : 'your PC',
        version: str(m.version, 32) ? m.version : '?',
        shared: m.shared && typeof m.shared === 'object' ? m.shared : {},
        facts: m.facts && typeof m.facts === 'object' ? m.facts : {},
        catalog: Array.isArray(m.catalog) ? m.catalog.slice(0, 20) : [],
      };
    case 'auth_err':
      return { t: 'auth_err', reason: str(m.reason, 40) ? m.reason : 'unknown' };
    case 'pong':
      return finite(m.t0) && finite(m.ts) ? { t: 'pong', id: m.id, t0: m.t0, ts: m.ts } : null;
    case 'click':
      return finite(m.b) ? { t: 'click', b: m.b } : null;
    case 'fact':
      return str(m.key, 32) && m.value && typeof m.value === 'object' ? { t: 'fact', key: m.key, value: m.value } : null;
    case 'sharing':
      return { t: 'sharing', shared: m.shared ?? {}, facts: m.facts ?? {} };
    case 'screens':
      return Array.isArray(m.list) ? { t: 'screens', list: m.list.slice(0, 16), virt: m.virt ?? null } : null;
    case 'say':
      return str(m.text, 200) && m.text.trim() ? { t: 'say', text: m.text.trim().slice(0, 80) } : null;
    case 'bye':
      return { t: 'bye', reason: str(m.reason, 40) ? m.reason : 'closed' };
    case 'powers':
      return Array.isArray(m.list) ? { t: 'powers', list: m.list.slice(0, 24).map(parsePowerEntry).filter(Boolean) } : null;
    case 'power':
      return ident(m.key) && ident(m.ev) ? { t: 'power', key: m.key, ev: m.ev, data: obj(m.data) } : null;
    case 'power_state':
      return ident(m.key) ? { t: 'power_state', key: m.key, state: obj(m.state) } : null;
    case 'cmd_result':
      return finite(m.id) ? { t: 'cmd_result', id: m.id, ok: m.ok === true, reason: str(m.reason, 40) ? m.reason : null, data: obj(m.data) } : null;
    case 'cmd_pending':
      return finite(m.id) ? { t: 'cmd_pending', id: m.id } : null;
    default:
      return null; // Unknown types are ignored so newer companions stay compatible.
  }
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
// Power keys/events become object keys on the phone: plain identifiers only (no "__proto__").
const ident = (v) => typeof v === 'string' && /^[a-z][a-z0-9_]{0,31}$/.test(v);

function parsePowerEntry(p) {
  if (!p || !ident(p.key) || !str(p.label, 80)) return null;
  return {
    key: p.key,
    label: p.label,
    description: str(p.description, 400) ? p.description : '',
    allowed: p.allowed !== false,
    on: p.on === true,
    active: p.active === true,
    commands: Array.isArray(p.commands) ? p.commands.filter((c) => c && str(c.name, 32)).slice(0, 16) : [],
    state: obj(p.state),
  };
}

export const msg = {
  auth: ({ token, code, deviceName }) => ({
    t: 'auth', v: PROTOCOL_VERSION,
    ...(token ? { token } : { code }),
    device: { name: deviceName },
  }),
  ping: (id, t0) => ({ t: 'ping', id, t0 }),
  sub: (opts) => ({ t: 'sub', ...opts }),
  stats: (s) => ({ t: 'stats', rtt: s.rtt, fps: s.fps, lat: s.lat }),
  event: (name) => ({ t: 'event', name: String(name).slice(0, 32) }),
  powerSet: (key, on) => ({ t: 'power_set', key: String(key).slice(0, 32), on: Boolean(on) }),
  powerAck: (key, action, kind) => ({ t: 'power_ack', key, action, ...(kind ? { kind } : {}) }),
  cmd: (id, power, name, args = {}) => ({ t: 'cmd', id, power, name, args }),
};

/** Normalizes a typed/scanned pairing code to the companion's alphabet. */
export function normalizeCode(input) {
  return String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/** Reads `#pair=CODE` from the URL fragment (fragments never reach server logs). */
export function pairCodeFromHash(hash) {
  const m = /(?:^|[#&])pair=([A-Za-z0-9-]{4,12})/.exec(hash ?? '');
  return m ? normalizeCode(m[1]) : null;
}
