# Mac companion (Phase 1): design

**Goal:** the companion runs on macOS as well as Windows, so friends with Macs can pair an
iPhone and have the pet follow the Mac's cursor. Windows behaviour stays exactly as it is.

**Phase 1 (this spec):** pairing (QR + code), cursor / clicks / multi-monitor, battery and
idle facts, "Say something", HTTPS app mode, Bonjour discovery, a Mac window, one-line install
for friends, CI on both OSes.
**Phase 2 (later):** Powers on Mac (break buddy, media keys, lock, timers, …). Until then the
Mac companion runs with Powers off; the phone already handles a companion without powers.

## Layout

| Project | Target | Contents |
|---|---|---|
| `companion.core/` (new) | `net8.0` | Everything that isn't UI, moved out of `companion/` with namespaces unchanged: `Server/`, `Facts/FactHub`, `Sensors/` (sampler + layout math), `Powers/` (all logic), plus `Platform/Windows/` and `Platform/Mac/`. |
| `companion/` | `net8.0-windows` (WPF) | `App`, `MainWindow`, `Ui/`, `WindowsActions` (needs the WPF dispatcher). References core. Same exe name, same output path, same behaviour. |
| `companion.mac/` (new) | `net8.0` + Avalonia 11 | Mac window + startup. References core. |
| `companion.tests/` | `net8.0` | References core only, so it runs on Mac, Windows and CI. |

## Platform seams (in core)

| Seam | Windows | macOS |
|---|---|---|
| `ICursorSource`: pacer, cursor position, buttons, monitor list | Win32 (`GetCursorPos`, `GetAsyncKeyState`, `EnumDisplayMonitors`, high-res waitable timer, per-monitor DPI) | CoreGraphics (`CGEventGetLocation`, `CGEventSourceButtonState`, `CGGetActiveDisplayList` / `CGDisplayBounds`), `Thread.Sleep` pacer. No Accessibility permission needed. |
| Fact providers (`battery`, `activity`, `load`) | Win32 (unchanged) | `pmset -g batt` (parsed), `CGEventSourceSecondsSinceLastEventType`; `load` reports `available:false` in Phase 1 |
| `IKeyVault`: CA private key at rest | DPAPI, `ca.pfx.dpapi` (unchanged) | `ca.p12` with owner-only permissions (file 0600, folder 0700). Not encrypted at rest; FileVault covers the disk. Keychain is a later hardening. |
| `IServiceAdvertiser`: Bonjour | `dnsapi.dll` (unchanged) | `DNSServiceRegister` from libSystem (`dns_sd`) |
| Data folder | `%APPDATA%\PeekPets` (unchanged) | `~/Library/Application Support/PeekPets` |

`PlatformServices` in core picks the right implementation for the running OS, so both shells
stay thin. Certificates: macOS can't load keys with `EphemeralKeySet`, so the Mac uses the
default key set.

Mac coordinates: CoreGraphics reports global points with (0,0) at the top-left of the main
display and y growing downwards (same orientation as Windows); monitor rectangles come from
`CGDisplayBounds` in the same space, so `DisplayLayout.Normalize` is reused unchanged.

## Mac window

Same look as the Windows window, Phone tab only: mini Mochi whose eyes follow the cursor,
status, pairing QR + code + expiry + New code / Copy link / Open here, install-as-app card with
the CA fingerprint, connected phones with Forget, sharing toggles, Say something, network,
activity log. Closing the window quits and sends `bye` to phones.

## Getting it onto a Mac

* **Friends (no developer tools):** one line in Terminal:
  `curl -fsSL https://raw.githubusercontent.com/LowLuke99/peek-pets/main/tools/mac/install-companion.sh | bash`
  It downloads the latest `Peek Pets Companion.app` (arm64 or x64, self-contained, no .NET
  needed) from the `companion-latest` GitHub release into `~/Applications` and opens it.
  `curl` downloads aren't quarantined, so no Gatekeeper "Open Anyway" dance. The app is
  ad-hoc signed only (no Apple Developer ID yet).
* **Developers (clone):** double-click `Start Peek Pets.command`. It installs the .NET 8 SDK
  into `~/.dotnet` if missing (Microsoft's `dotnet-install.sh`, no admin), then runs the Mac
  companion from source, serving `phone/` live like the Windows dev flow.
* **First run:** macOS asks to allow incoming connections (click Allow) and, on macOS 15,
  may ask for Local Network access.

## CI (`.github/workflows/companion.yml`)

* `windows-latest`: build the WPF companion, run `companion.tests`.
* `macos-15`: run `companion.tests`, publish the Mac app for arm64 + x64, bundle it into
  `Peek Pets Companion.app`, smoke-test it (`--loopback` then `GET /api/info`), upload zips.
* On `main` (and manual runs): replace the assets of the `companion-latest` release.

## Testing

* Existing companion tests run on macOS (cert tests use the platform's vault).
* New tests: Mac display bounds → `DisplayLayout`, `pmset` parsing, TXT record bytes,
  owner-only vault permissions.
* End to end on a Mac: run the Mac companion, open the phone page, pair, move the cursor,
  confirm cursor messages arrive.

## Risks

* Windows WPF can't run on a Mac: the Windows CI job is the guard that the split didn't break it.
* Avalonia adds a dependency only to the Mac shell; the Windows app doesn't change toolkit.
* Unsigned app: if a friend downloads the zip in a browser instead of using the one-liner,
  they need System Settings → Privacy & Security → Open Anyway.
