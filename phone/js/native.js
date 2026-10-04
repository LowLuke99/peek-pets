// Native extras when the pet runs inside the iPhone app (Capacitor), with quiet web
// fallbacks in Safari: haptics, local notifications (while the app is open) and
// keep-awake. Plugins are reached through window.Capacitor.Plugins, so the web build
// needs no bundler and no Capacitor JavaScript.

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : null);

export const isNative = () => Boolean(cap()?.isNativePlatform?.());

function plugin(name) {
  return isNative() ? cap()?.Plugins?.[name] ?? null : null;
}

/** kind: 'tap' | 'soft' | 'success' | 'warning' | 'alarm' */
export function haptic(kind = 'tap') {
  const H = plugin('Haptics');
  try {
    if (H) {
      if (kind === 'success' || kind === 'warning') return void H.notification({ type: kind === 'success' ? 'SUCCESS' : 'WARNING' }).catch(() => {});
      if (kind === 'alarm') return void H.vibrate({ duration: 600 }).catch(() => {});
      return void H.impact({ style: kind === 'soft' ? 'LIGHT' : 'MEDIUM' }).catch(() => {});
    }
    navigator.vibrate?.(kind === 'alarm' ? [200, 100, 200, 100, 300] : kind === 'success' ? [30, 40, 30] : 15);
  } catch { /* haptics are a bonus */ }
}

let notifyId = 1;
let notifyAllowed = null;

/** A local notification (native app only; iOS shows it while the app is open or just backgrounded). */
export async function notify(title, body) {
  const N = plugin('LocalNotifications');
  if (!N) return false;
  try {
    if (notifyAllowed === null) {
      const perm = await N.requestPermissions();
      notifyAllowed = perm?.display === 'granted';
    }
    if (!notifyAllowed) return false;
    await N.schedule({ notifications: [{ id: notifyId++, title, body, schedule: { at: new Date(Date.now() + 250) } }] });
    return true;
  } catch {
    return false;
  }
}

/** Real keep-awake in the native app; returns false so the web fallback can take over. */
export async function nativeKeepAwake(on) {
  const K = plugin('KeepAwake');
  if (!K) return false;
  try {
    await (on ? K.keepAwake() : K.allowSleep());
    return true;
  } catch {
    return false;
  }
}
