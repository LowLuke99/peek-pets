# Build record: Peek Pets prototype

*Built 2026-10-03 in one autonomous session, from the brief, live-test plan and four visual
sheets in `Desktop\Phone Pet Prototype`.*

## Stack (and why)
* **PC companion: C# .NET 8 WPF + Kestrel**, one exe. Windows Firewall here has *Block*
  rules for `node.exe` on Public networks (your Wi-Fi is Public), so a Node server could
  never be reached from the phone. A dedicated exe gets its own firewall identity and a
  clear "Peek Pets" prompt. It also gives native Win32 cursor/battery/idle access and a real window.
* **Phone: plain web app** (ES modules + Canvas 2D, no build step) served by the companion.
  Fastest route to a live iPhone test in Safari, and it became an installable home-screen app (HTTPS mode).

## What was built
**Live link**
* 125 Hz cursor sampler on a high-res waitable timer, per-monitor-DPI aware; whole-desktop
  *and* current-monitor coordinates; runs only while a phone is watching.
* WebSocket protocol v1 ([PROTOCOL.md](PROTOCOL.md)): pairing code (QR or typed) traded for a hashed
  device token, per-IP rate limiting, LAN-only request guard, latest-value cursor slot
  (stale samples dropped), 60 Hz cap, pause when the phone screen is off.
* Heartbeat + reconnect backoff on the phone; companion sends `bye` on exit; NTP-style
  clock sync so the phone measures true cursor delay.
* Permission toggles for PC facts: battery (honest "no battery" on desktops), time away
  from PC, CPU/RAM. New facts plug in via `IFactProvider`.
* `say` channel PC → pet (the hook for future AI/notifications).

**The pet**
* Layered rig: eyes on a fast critically-damped spring (ω≈44), head lean on a slower bouncy
  spring (follow-through), squash & stretch, hops with anticipation, dance, breathing, sway,
  idle saccades and micro-saccades, scheduled + saccade-linked blinks with per-eye offset.
* Eyes clip to the open lid region (one continuous lid curve: wide → normal → sleepy → "‿").
  Three eye styles, foreshortened irises, highlights, ^ ^ joy arcs, dizzy spirals, star sparkles.
* 14 expressions blended per channel (neutral, curious, focused, happy, joy, love,
  surprised, sleepy, asleep, waiting, worried, dizzy, wince, proud).
* Pure mood reducer: reactions with chains (wince→happy), sleep pressure (faster at night or
  when you're away from the PC), wake-ups, gentle "waiting" when the PC disappears, never punitive.
* Interactions: tap, eye-poke, 5-tap dizzy, stroke-to-pet, hug (long press), double-tap hop,
  finger-look, ball toy with physics (the pet bonks it back), cheer, dance (+ synthesized tune), nap.
  PC-driven: gaze, click-flinch, fast-flick startle, mouse-circles dizzy, battery/charging/away reactions.
* **8 pets**: Mochi, Pip, Nimbus, Plum, Sprig (from the concept sheets) + Ember, Puff, Bun (new),
  each with its own palette, secondary motion (antennas/ears/fins/ring/flame) and lines.
* Bond meter per pet (only rises; decays never below your level), speech bubbles, sounds (toggle).
* Accessibility: live status text, canvas aria-label describing mood + link, reduced-motion
  setting (also honors the OS setting), visible focus rings, 44 px dock/top-bar buttons
  (status chip 40 px), body text and button text contrast ≥ 4.5:1 on every pet palette.

**App & companion UX**
* Companion window: QR + code, sharing toggles, connected phones with live RTT/delay/fps,
  firewall diagnosis + one-click scoped fix, "say something", activity log, a tiny Mochi
  that watches your cursor on the PC too.
* Installable app mode: private CA **name-constrained to LAN IPs + `.local`** (a test proves a
  forged `google.com` cert is rejected), HTTPS on :8788, service worker caches the whole pet,
  guided install page with a live "is it trusted yet?" check.
* App icons rendered from the pet's own drawing code; desktop shortcut; `Start Peek Pets.cmd`;
  `tools/publish.ps1` for a standalone build a friend can run without .NET.

## What works, and how it was verified
| Check | Result | How |
|---|---|---|
| Real cursor → phone page | **median 7.8 ms**, p90 16 ms | `live-test.mjs`: `SetCursorPos` on this PC → instrumented page (same PC, LAN IP) |
| Real cursor → eyes settled | **median 112 ms**, p90 121 ms | same, Chromium at 60 fps |
| Eyes point to all 4 corners + center | pass | same, both engines |
| Pair via QR link / reconnect by token | 270–505 ms / ~1.1 s after relaunch | same |
| Companion closed (bye) → phone shows it | 0.24–0.4 s | same |
| Companion crashed → detected | 0.25–0.5 s | same |
| Wrong code refused, brute force rate-limited, stranger stays unpaired | pass | same |
| Demo mode with no PC | pass | same |
| Installed app: wss, offline cache (50 files), opens + reacts with PC **off** | 7/7 | `app-mode-test.mjs` (Chromium, test CA accepted by flag) |
| Phone logic unit tests | 40/40, 92.6 % lines of `js/core` | `npm test` |
| Companion unit tests | 38/38 (Pairing 99 %, settings 98 %) | `dotnet test companion.tests` |
| Rendering | 60 fps (Chromium); all 8 pets × 6 expressions reviewed | `fps-probe.mjs`, `gallery.mjs` |

Live test: 23/23 in **WebKit** (Safari's engine, iPhone 15 profile) and 23/23 in Chromium (incl. foreign-origin socket refused).
Recording: `docs/media/live-test-chromium.mp4`, `docs/media/eyes-follow-cursor.gif`.

## Not verified on a real iPhone (please check)
I had no iPhone, so everything above ran on this PC (WebKit/Chromium with an iPhone profile,
connecting to the PC's LAN IP). Specifically unproven:
1. **The Wi-Fi hop itself.** Expect ~5–30 ms extra over the numbers above; iPhone Wi-Fi power
   saving can add occasional spikes. The Settings → *Show link stats* overlay shows live numbers.
2. **Firewall from another device.** Rules now exist for the companion (you or Windows
   allowed it during the session), but no packet from a phone has actually arrived yet.
   Router "client/AP isolation" would also block it.
3. **iOS certificate install flow** (profile download → install → trust toggle) and the
   home-screen app's offline launch on real iOS.
4. **Keep screen on** in plain Safari uses a muted-video trick that may not work on recent iOS;
   in the installed app it uses the real Wake Lock API.
5. Safari's rendering speed. WebKit on Windows renders in software at ~10 fps, so motion
   smoothness was judged in Chromium (60 fps). iPhones GPU-accelerate canvas; I expect 60 fps.
6. Sound on iOS: Web Audio unlocks on first tap; the silent switch may mute it.

## Security review (done in-session)
A security reviewer pass found no critical issues; the phone side was XSS-clean (all PC text goes
through `textContent`). Fixed from its findings: CA fingerprint shown for out-of-band
checking; hard 10 s deadline + per-IP cap for unauthenticated sockets; pairing code is single-use
and rotates on success or after 20 failures/min from anywhere (beats address hopping); IPv6
rate-limited per /64; CA key DPAPI-encrypted at rest and non-exportable in memory; WebSocket
`Origin` check (blocks cross-site pages / DNS rebinding); thread-safe cached TLS cert selection;
firewall check no longer splices a path into a PowerShell script; elevated helper only runs from
next to the exe; CGNAT removed from "local network"; install page validates its inputs.
Accepted: quick mode is plain HTTP on the LAN (use the installed app for encryption), and the
firewall rule uses profile *Any* because this Wi-Fi is marked Public (it stays subnet-scoped).

## Known limitations
* The installed app's address includes the PC's IP. If your router hands the PC a new IP,
  re-scan (or set a DHCP reservation for the PC).
* Desktop has no battery, so battery reactions were tested only as "no battery".
* Cursor wraps all monitors by default; physical "phone left/right/below" gaze modes are
  approximations without per-monitor physical sizes.
* The pet doesn't yet appear on the PC beyond the tiny window mascot.

## Recommended next steps
1. **Real-device pass** (15 min): pair, sweep the cursor, check the stats overlay, close and
   reopen the companion, try the install flow. Tune `GAZE_OMEGA` in `phone/js/pet/rig.js`
   if the eyes feel too snappy or too floaty on the phone.
2. **Sound & haptics polish:** iOS-safe audio unlock indicator; per-pet voices.
3. **Desktop pet (optional):** a borderless always-on-top mini pet on the PC that hands off to the phone.
4. **Sharing with a friend:** `tools/publish.ps1` → zip; a signed exe would remove SmartScreen warnings.
5. **Native iPhone app** later (Swift/WKWebView wrapper) only if push notifications or
   background presence are wanted.

## Next milestone: voice & AI (decisions needed from you)
The plumbing is ready (`say`, `event`, and the fact system). Choices:
1. **What should the pet *do*?** (a) ambient companion that comments on what you're doing
   (needs the most data), (b) a helper you talk to ("what's my battery?", timers, reminders),
   or (c) pure character: reacts and chats, no tasks.
2. **Where does the AI run?** Local (private, free, weaker, needs a GPU model) vs cloud
   (Claude API: smarter, costs per use, sends your words off-device).
3. **Voice?** Phone mic → PC speech-to-text, and/or pet speaks via text-to-speech. iOS requires
   a tap to start the mic and HTTPS (the installed app has it).
4. **What may it see?** Today: cursor, clicks, battery, idle, load, and never the screen or keys.
   Anything more (active app name, calendar…) should be a new opt-in fact.
5. **Pet on PC too?** Phone-only, a PC desktop pet, or "walks between" both.
