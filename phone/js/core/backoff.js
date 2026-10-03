// Reconnect pacing: quick retries first (the PC app often just restarted), then a calm
// steady pace that won't drain the phone's battery while the PC is off.

const STEPS = [400, 900, 1600, 2500, 4000];
export const STEADY_MS = 5000;
export const SLEEPY_MS = 15000;
export const SLEEPY_AFTER_MS = 3 * 60 * 1000;

/**
 * @param {number} attempt 0-based retry count
 * @param {number} failingForMs how long we've been disconnected
 * @param {() => number} [rand]
 */
export function reconnectDelay(attempt, failingForMs, rand = Math.random) {
  const base = failingForMs > SLEEPY_AFTER_MS ? SLEEPY_MS : STEPS[attempt] ?? STEADY_MS;
  const jitter = 1 + (rand() - 0.5) * 0.3; // ±15% so many phones don't sync up
  return Math.round(base * jitter);
}
