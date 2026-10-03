// The pet's emotional state as a pure reducer: (state, event, now) -> state.
// Base moods come from context (connection, time of day, inactivity); short reactions
// (taps, PC events) layer on top and expire. Nothing here ever punishes the user:
// a neglected pet just naps, and wakes up glad to see you.

export const SLEEPY_AFTER_S = 80;
export const ASLEEP_AFTER_S = 160;
const NIGHT_FACTOR = 0.55;
const PC_AWAY_FACTOR = 0.6;
const TAP_COMBO = 5;
const TAP_COMBO_WINDOW_MS = 2200;
const WAITING_FOR_MS = 60_000;

export function initialMood(now) {
  return Object.freeze({
    reaction: null,         // { emotion, until, then?: {emotion, ms} }
    lastStimulus: now,
    napping: false,
    tapTimes: [],
    bubble: null,           // { key, at } short speech cue for the UI
    asleepSince: null,
  });
}

const react = (emotion, ms, now, then) => ({ emotion, until: now + ms, then: then ?? null });

function withBubble(state, key, now) {
  return { ...state, bubble: { key, at: now } };
}

function stimulate(state, now) {
  return { ...state, lastStimulus: now };
}

/** Wakes the pet with a little startle → smile, if it was asleep. */
function maybeWake(state, now, gentle) {
  if (!isAsleepish(state, now)) return state;
  const reaction = gentle
    ? react('sleepy', 700, now, { emotion: 'curious', ms: 1200 })
    : react('surprised', 600, now, { emotion: 'happy', ms: 1400 });
  return withBubble({ ...state, napping: false, reaction, asleepSince: null }, 'wake', now);
}

function isAsleepish(state, now) {
  return state.napping || state.asleepSince !== null || now - state.lastStimulus > SLEEPY_AFTER_S * 1000;
}

/**
 * @param {ReturnType<typeof initialMood>} state
 * @param {{type: string, [k: string]: any}} event
 * @param {number} now ms
 */
export function moodReduce(state, event, now) {
  switch (event.type) {
    case 'tap': {
      const woke = maybeWake(state, now, false);
      if (woke !== state) return stimulate({ ...woke, tapTimes: [now] }, now);
      const taps = [...state.tapTimes.filter((t) => now - t < TAP_COMBO_WINDOW_MS), now];
      if (taps.length >= TAP_COMBO) {
        return stimulate(withBubble({ ...state, tapTimes: [], reaction: react('dizzy', 2200, now, { emotion: 'happy', ms: 900 }) }, 'dizzy', now), now);
      }
      return stimulate({ ...state, tapTimes: taps, reaction: react('happy', 1100, now) }, now);
    }
    case 'double':
      return stimulate({ ...maybeWake(state, now, false), reaction: react('joy', 1400, now) }, now);
    case 'pet': // fired repeatedly while being stroked
      return stimulate({ ...maybeWake(state, now, true), napping: false, reaction: react('love', 700, now) }, now);
    case 'hug':
      return stimulate(withBubble({ ...maybeWake(state, now, true), reaction: react('love', 2000, now) }, 'hug', now), now);
    case 'poke-eye':
      return stimulate(withBubble({ ...maybeWake(state, now, false), reaction: react('wince', 900, now, { emotion: 'happy', ms: 600 }) }, 'poke', now), now);
    case 'cheer':
      return stimulate(withBubble({ ...state, napping: false, asleepSince: null, reaction: react('joy', 2200, now) }, 'cheer', now), now);
    case 'dance':
      return stimulate({ ...state, napping: false, asleepSince: null, reaction: react('joy', event.ms ?? 6000, now) }, now);
    case 'play':
      return stimulate({ ...state, napping: false, asleepSince: null, reaction: react('curious', 900, now) }, now);
    case 'ball-hit':
      return stimulate({ ...state, reaction: react('surprised', 380, now, { emotion: 'joy', ms: 900 }) }, now);
    case 'nap':
      return event.on
        ? withBubble({ ...state, napping: true, reaction: null, asleepSince: now }, 'nap', now)
        : maybeWake({ ...state }, now, false);
    case 'connect':
      return stimulate(withBubble({ ...maybeWake(state, now, true), reaction: react('joy', 1600, now) }, 'connect', now), now);
    case 'disconnect':
      return withBubble({ ...state, reaction: state.napping ? null : react('surprised', 500, now) }, event.closed ? 'pc-closed' : 'disconnect', now);
    case 'cursor':
      return stimulate(maybeWake(state, now, true), now);
    case 'cursor-burst':
      return stimulate({ ...state, reaction: react('surprised', 550, now, { emotion: 'focused', ms: 800 }) }, now);
    case 'cursor-spin':
      return stimulate(withBubble({ ...state, reaction: react('dizzy', 2600, now, { emotion: 'happy', ms: 800 }) }, 'dizzy', now), now);
    case 'say':
      return stimulate({ ...maybeWake(state, now, true), reaction: react('curious', 1500, now) }, now);
    case 'charging':
      return withBubble({ ...state, reaction: react('happy', 1500, now) }, 'charging', now);
    case 'pc-back':
      return stimulate(withBubble({ ...maybeWake(state, now, true), reaction: react('happy', 1600, now) }, 'pc-back', now), now);
    case 'touch':
      return stimulate(maybeWake(state, now, true), now);
    default:
      return state;
  }
}

/** Advances timers: expires reactions (following `then` chains) and falls asleep. */
export function moodTick(state, ctx, now) {
  let next = state;
  if (next.reaction && now >= next.reaction.until) {
    const then = next.reaction.then;
    next = { ...next, reaction: then ? react(then.emotion, then.ms, now) : null };
  }
  const d = drowsiness(next, ctx, now);
  if (d >= 1 && next.asleepSince === null) next = withBubble({ ...next, asleepSince: now }, 'sleep', now);
  if (d < 1 && next.asleepSince !== null && !next.napping) next = { ...next, asleepSince: null };
  return next;
}

/** 0 = wide awake, ≥0.5 sleepy, ≥1 asleep. */
export function drowsiness(state, ctx, now) {
  if (state.napping) return 1;
  let idleS = (now - state.lastStimulus) / 1000;
  const hour = ctx.hour ?? 12;
  if (hour >= 22 || hour < 6) idleS /= NIGHT_FACTOR;
  if ((ctx.pcIdleSec ?? 0) >= 300) idleS /= PC_AWAY_FACTOR;
  if (idleS < SLEEPY_AFTER_S) return (idleS / SLEEPY_AFTER_S) * 0.5;
  return 0.5 + 0.5 * Math.min(1, (idleS - SLEEPY_AFTER_S) / (ASLEEP_AFTER_S - SLEEPY_AFTER_S));
}

/**
 * Which expression to show right now.
 * @param {{link?: string, disconnectedAt?: number|null, batteryLow?: boolean,
 *          cursorActive?: boolean, cursorFast?: boolean, hour?: number, pcIdleSec?: number}} ctx
 */
export function currentEmotion(state, ctx, now) {
  if (state.reaction && now < state.reaction.until) return state.reaction.emotion;
  const d = drowsiness(state, ctx, now);
  if (d >= 1) return 'asleep';
  if (d >= 0.62) return 'sleepy';
  if (ctx.link === 'reconnecting' && ctx.disconnectedAt != null && now - ctx.disconnectedAt < WAITING_FOR_MS) return 'waiting';
  if (ctx.batteryLow) return 'worried';
  if (ctx.cursorFast) return 'focused';
  if (ctx.cursorActive) return 'curious';
  return 'neutral';
}
