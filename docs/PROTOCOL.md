# Peek Pets live-link protocol (v1)

The PC companion and the phone talk JSON over one WebSocket on the local network.

| Mode | Page | Socket |
|---|---|---|
| Quick (Safari) | `http://<pc-ip>:8787/` | `ws://<pc-ip>:8787/ws` |
| Installed app | `https://<pc-ip>:8788/` | `wss://<pc-ip>:8788/ws` |

Every message is an object with a type field `t`. Unknown types are ignored on both
sides, so a newer companion can add features without breaking older phones (and the reverse).
The server rejects any request from outside private/link-local ranges (HTTP 403).

## Handshake and pairing

```
phone → connects /ws
PC    → {"t":"hello","v":1,"app":"peek-pets","version":"0.1.0","ts":1234.5}
phone → {"t":"ping","id":1,"t0":<phone ms>}                     (starts clock sync)
phone → {"t":"auth","v":1,"code":"ABC234","device":{"name":"iPhone"}}   first time
   or → {"t":"auth","v":1,"token":"<device token>","device":{...}}      afterwards
PC    → {"t":"auth_ok","token":"<only on first pairing>","deviceId":"…","pc":"LUKE-PC",
         "version":"0.1.0","shared":{"cursor":true,"clicks":true,"battery":true,"activity":true,"load":false},
         "facts":{"battery":{…},"activity":{…}},"catalog":[{"key","label","description"}…]}
PC    → {"t":"screens","list":[{"x","y","w","h","primary"}…],"virt":{"x","y","w","h"}}
phone → {"t":"sub","cursorHz":60,"paused":false}
```

* **Pairing code:** 6 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O/1/I/L). It's
  valid for 10 minutes, shown on the PC and in the QR code's URL **fragment** (`#pair=…`,
  which never reaches server logs).
* **Device token:** 32 random bytes, base64url. The phone stores it; the PC stores only its
  SHA-256. "Forget" on either side revokes it.
* **Rate limit:** 5 failed attempts per minute per IP gives a 60 s lockout (`auth_err rate_limited`).
* **Errors:** `{"t":"auth_err","reason":"bad_code"|"code_expired"|"bad_token"|"rate_limited"|"malformed"|"not_authed"}`.
* Unauthenticated sockets are closed after 10 s; authenticated ones after 20 s of silence.

## Streams (PC → phone)

| Message | Meaning |
|---|---|
| `{"t":"c","x":0.512,"y":0.2,"m":0,"mx":0.512,"my":0.2,"s":4211,"ts":98765.4}` | Cursor. `x,y` = fraction of the whole virtual desktop; `mx,my` = fraction of monitor `m` (0 = primary); `s` = sequence; `ts` = PC ms when sent. |
| `{"t":"click","b":1}` | Mouse button pressed (bitmask 1=L, 2=R, 4=M). No position, no app. Only if "clicks" is shared. |
| `{"t":"fact","key":"battery","value":{…}}` | A shared PC fact changed (see below). |
| `{"t":"sharing","shared":{…},"facts":{…}}` | The user flipped a sharing toggle on the PC. |
| `{"t":"screens",…}` | Monitor layout changed. |
| `{"t":"say","text":"Lunch time!"}` | Show a speech bubble (≤ 80 chars). **Reserved hook for AI / notifications.** |
| `{"t":"pong","id":1,"t0":…,"ts":…}` | Clock-sync reply. |
| `{"t":"bye","reason":"companion_closed"}` | Companion is quitting on purpose. The phone shows "PC app closed" at once. |

### Cursor delivery rules
* Sampled at 125 Hz on a high-resolution waitable timer, per-monitor-DPI aware (physical
  pixels across mixed-scale monitors).
* Sent only when the position changes, at most `cursorHz` (default 60, range 5–120).
* Each phone has a **latest-value slot**, not a queue. If the link is slow, stale positions are
  dropped, never replayed, so the eyes never lag behind a backlog.
* Sampling stops completely when no phone is streaming (screen off → `sub paused:true`).

### Facts (permission-gated, off = never read)
| key | value | default |
|---|---|---|
| `battery` | `{available:false, reason:"no_battery", pluggedIn}` or `{available:true, percent, charging, pluggedIn, saver}` | on |
| `activity` | `{available:true, idleSec}`: seconds since last input, bucketed to 5 s; no keys are read | on |
| `load` | `{available:true, cpu, memory}`: percentages | off |

Add a fact by implementing `IFactProvider` (`companion/Facts/FactProviders.cs`) and adding
it to `FactHub`. It automatically gets a toggle, is shown on the phone's PC sheet, and is
only read while shared.

## Phone → PC

| Message | Meaning |
|---|---|
| `ping` | Every 2 s. Also the liveness heartbeat: no message in 6 s means the phone treats the link as dead and reconnects. |
| `sub` | `{cursorHz?, paused?}`: phone screen off pauses the stream. |
| `stats` | `{rtt, fps, lat}` shown in the companion window. |
| `event` | `{name}` ≤ 32 chars: `boop`, `pet`, `hug`, `play`, `cheer`, `dance`, `sleep`. Lets the PC side react later (e.g. a desktop pet, or an AI that knows you just played). |

## Latency accounting
The phone estimates the PC→phone clock offset NTP-style, keeping the lowest-RTT sample of
the last 8 pings. Then `delay = phone_now − (ts − offset)` for each cursor message. The
live test measures the real thing: a cursor move made by `SetCursorPos` to the moment the
page receives it, and to the moment the eyes settle.

## Reserved for the next milestones
* `say` is already wired PC → phone. An AI or notification feature only has to call
  `PetServer.Say(text)`.
* Planned types (not implemented): `voice_start` / `voice_chunk` / `voice_end` (phone mic →
  PC), `speak` (PC TTS → phone audio), `ask` / `answer` (assistant turns), `mood` (PC-side
  brain sets an emotion). They must stay opt-in, like facts.
