# Next session prompt: Peek Pets v2 (helpful PC powers, better looks, native app)

Paste everything below the line into a new session (e.g. after `/goal`).

---

Continue building **Peek Pets** at `C:\Users\lukep\peek-pets` (private repo LowLuke99/peek-pets). It's an
iPhone pet whose eyes follow my PC cursor: a Windows companion (`companion/`, .NET 8 WPF + Kestrel)
streams the cursor over the LAN to a phone web app (`phone/`, vanilla ES modules + Canvas 2D).
**Read `README.md`, `docs/BUILD-RECORD.md` and `docs/PROTOCOL.md` first**, and look at the code before
changing it. Everything currently works and is tested; keep it that way.

I'll be away for several hours. Work autonomously, make reasonable decisions, and keep building and
testing instead of stopping at mockups. Commit and push to the repo as you go (small, conventional
commits). Don't ask me questions mid-way; note open decisions in the build record instead.

Three workstreams, in this order. Each must leave the app working and tested before the next starts.

## 1. "Helpful powers": the pet actually helps me on my PC (build many, find what's good)

I want to try a lot of ideas and keep the good ones. Build each power as a **self-contained, switchable
experiment** with a shared framework:

- **Framework first.** A power = a module on the PC side (sensor and/or action) + a module on the phone
  (UI + pet reactions), registered in one list. Each has an on/off switch in a new **"Powers" (labs)
  screen** on the phone and a matching permission toggle in the companion window. Count local usage
  per power (how often it fired, was used, was dismissed), shown in a "Labs scorecard" on the PC, so I
  can see which ones earn their place. Off means fully off: no reading, no sending.
- **Phone → PC commands are new and must be safe:** a fixed allowlist of named commands only (never
  arbitrary shell/exec), each needing its PC-side permission; the first use of any command asks for
  confirmation on the PC; rate limits; an audit log in the companion window; authenticated sessions only.
  Extend `docs/PROTOCOL.md` (bump the version only if you break compatibility).
- **The pet is the interface.** Every power should show up as pet behaviour (expressions, poses, props,
  speech bubbles), not just as a notification. Keep nudges gentle and never guilt-trippy.

Powers to build and test (do as many as you can, roughly in this order):

1. **Break & eye buddy.** Active-time tracking from the existing activity fact. 20-20-20 eye-strain
   nudges (the pet does a big "look far away" animation), stretch nudge after ~90 min of continuous
   activity, water reminders. Snooze/skip from the phone. The pet gets visibly tired on long stretches and
   happy when you take a break.
2. **Focus session.** Start a 25/50-min focus timer from the phone; the pet sits with a tiny desk/book
   prop, the phone shows a calm countdown, it celebrates at the end, and nudges the break.
3. **Media remote.** Play/pause, next, previous, volume up/down/mute from the phone (Windows media keys /
   system volume). If available, show what's playing (Windows media session title/artist; read only).
   The pet bops along when music plays.
4. **"Tell me when it's done."** Pick a running process (or "the busy one": highest CPU) on the phone; the
   PC watches until it exits or its CPU stays low; also "downloads folder finished changing". The pet waits
   with you, then cheers and shows a bubble. Works great for renders, builds, installs, downloads.
5. **PC health watchdog.** Low disk space on any drive (my C: is chronically near full: make this good),
   a RAM/CPU hog that names the app, and the PC getting hot/throttling if that's readable. The pet looks
   worried with a small prop and offers a one-tap "open Storage Settings" / "open Task Manager".
6. **Phone ↔ PC handoff.** Send text or a photo from the phone; it lands on the PC clipboard and/or in a
   `Peek Pets Inbox` folder, with a toast on the PC. The other way: "grab PC clipboard" puts copied PC
   text on the phone. Size limits, images only + text, no executables.
7. **Find my cursor & quick actions.** "Where's my cursor?" makes the PC flash/ring the cursor while the pet
   points. Lock PC. Mic mute toggle for calls (if feasible without drivers). Launch a small, user-chosen
   list of favourite apps/sites (configured on the PC, not typed on the phone).
8. **Timers & reminders.** Quick timers from the phone ("pizza in 12 min"); the pet holds up the timer and
   alerts on both phone and PC.
9. **Away summary.** When I come back after being away from the PC, the pet greets me with a tiny summary
   ("render finished, 2 breaks skipped, disk still low").

Gather only what each power needs, and never read screen contents or keystrokes.

## 2. Much higher pet visual quality

The pets are good but I want them to look like the concept art (`C:\Users\lukep\Desktop\Phone Pet
Prototype\*.png`): soft clay/vinyl toys with real depth, subsurface glow, soft shadows, glossy eyes.

- **Primary approach: a WebGL renderer** (raw WebGL2 or a small proven library from cdnjs/jsdelivr)
  that draws pet bodies as **signed-distance-field shapes lit in a shader**: soft key light + rim light +
  ambient occlusion + subsurface scattering + subtle grain, real soft contact shadows, maybe bloom for
  glowing pets. Bodies stay procedural so squash/stretch, lean, breathing and secondary motion still work.
  Eyes get a proper glossy treatment (cornea highlight, iris detail, wet-look reflections).
- Keep the current Canvas 2D renderer as an automatic **fallback** (no WebGL / low power), and keep the
  rig, gaze, mood and species data model: species gain shader material settings rather than being
  rewritten from scratch. Upgrade all 8 pets; Mochi first, and make it beautiful before doing the rest.
- Add **new poses/props** the powers need (yawn, stretch, look-far-away, headphones for music, tiny
  timer/book/bandage props, waving), animated, not static images.
- Hold 60 fps on an iPhone; measure in Chromium (WebKit on Windows renders in software, ~10 fps, so judge
  motion there only for correctness). Battery: cap resolution sensibly, throttle when idle/asleep.
- Review every pet × key expression in a contact sheet (`tools/e2e/gallery.mjs`) and iterate on what
  looks off. Compare against the concept sheets.
- (Optional, ask me first: AI-generated texture or detail maps via the Kling/Higgsfield tools cost credits;
  do not spend credits without my approval. Note it as a proposal in the build record instead.)

## 3. Native iPhone app (smoother than the website)

I'm on Windows with no Mac. Make a real app with the least friction:

- Wrap the existing phone app with **Capacitor** (reuse the web code; no rewrite). Add native wins:
  haptics on boops/reactions, reliable keep-awake, local notifications for powers while the app is open,
  **automatic PC discovery over Bonjour/mDNS** (the companion advertises `_peekpets._tcp` on the LAN), so
  pairing becomes "pick your PC" plus confirming the code, and plain local-network WebSocket (ATS local
  networking exception) so no certificate install is needed. Keep the website/PWA working too.
- Build iOS in **GitHub Actions on a macOS runner** and upload the unsigned `.ipa` as an artifact. Document
  both install paths: **Sideloadly on Windows with a free Apple ID** (free, re-install every 7 days) and
  **TestFlight with a paid Apple Developer account** (fastlane lane ready, secrets documented, not set).
  Keep the CI workflow cheap (macOS minutes cost 10x; build on tags/manual dispatch only).
- iOS freezes background apps, so don't promise background pings. Note the push-notification option
  (APNs via a tiny relay) as a future decision rather than building it.

## Engineering expectations (same bar as last time)

- Follow the existing conventions (pure logic in `phone/js/core` with node tests; companion logic with xUnit;
  small focused files, nothing over ~400 lines). Tests first for new logic. Keep `npm test`,
  `dotnet test companion.tests`, `tools/e2e/live-test.mjs` (both engines), `app-mode-test.mjs` and
  `actions-test.mjs` green, and add e2e coverage for the powers (phone triggers → PC effect verified, and
  PC event → pet reaction verified). Commands that change the PC (volume, lock, launch) should be
  tested via a dry-run/injected backend, never by actually locking my PC during tests.
- Run a security review of the new phone→PC command surface before finishing and fix what it finds.
- The companion I launch is `companion\bin\Debug\net8.0-windows\PeekPets.Companion.exe` (it has firewall
  allow rules; a different exe path triggers a new Windows prompt). Stop it before rebuilding and restart it
  when you're done so it's running when I'm back.
- Be candid about anything you couldn't verify on a real iPhone.

## Hand-off

Update `docs/BUILD-RECORD.md` with a v2 section: what was built, what works and how it was verified,
the Labs scorecard plan, what's unverified, the native-app install steps, open decisions for me
(Apple account type, AI/voice plans, which powers to keep), and recommended next steps. Update the
README's "Things to try" with the new powers. Leave screenshots of the new looks and the Powers screen
plus a short recording in `docs/`.
