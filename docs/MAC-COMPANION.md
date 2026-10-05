# Peek Pets Companion on a Mac

The companion is the computer half of Peek Pets: it reads the cursor and serves the pet to
your iPhone over Wi-Fi. It runs on **Windows and macOS**. This page is the Mac one.

## Install (friends: one line, about 1 minute)

1. Open **Terminal** (Spotlight: ⌘ Space, type *Terminal*, Return).
2. Paste this and press Return:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/LowLuke99/peek-pets/main/tools/mac/install-companion.sh | bash
   ```
3. The **Peek Pets Companion** window opens. If macOS asks *"Accept incoming network
   connections?"* or for **Local Network** access, click **Allow**.
4. On the iPhone (same Wi-Fi): open the **Camera**, point it at the QR code, tap the link.
   The status pill turns green: *"Linked to Luke's MacBook Air"*. Move your mouse.

It lands in the **Applications folder in your home folder** (`~/Applications`), so no admin
password is needed. Open it again later from there or from Spotlight.

* **Update:** run the same line again.
* **Remove:** drag *Peek Pets Companion* from `~/Applications` to the Bin. Settings live in
  `~/Library/Application Support/PeekPets` (delete that folder too for a clean slate).
* Needs macOS 12 or newer, Apple silicon or Intel. No .NET or developer tools.

### Downloaded the zip in a browser instead?
The app isn't signed with an Apple Developer ID yet, so a browser download gets blocked
("Apple could not verify…"). Use the Terminal line above, or after the first attempt go to
**System Settings → Privacy & Security → Open Anyway**.

## What works on the Mac

| | Mac | Windows |
|---|---|---|
| Pairing (QR + code), reconnects by itself | ✓ | ✓ |
| Eyes follow the cursor, all monitors | ✓ | ✓ |
| Clicks make the pet blink | ✓ | ✓ |
| Battery and "away from the computer" facts | ✓ | ✓ |
| CPU & memory load fact | later | ✓ |
| Say something | ✓ | ✓ |
| Install as an iPhone app (HTTPS mode) | ✓ | ✓ |
| iPhone app finds the computer by itself (Bonjour) | ✓ | ✓ |
| Powers (break buddy, media keys, timers, …) | later (Phase 2) | ✓ |

No special macOS permissions are needed: reading the pointer position, button state and idle
time doesn't require Accessibility or Input Monitoring. Keys and screen contents are never read.

## Testing a checkout (developers)

Double-click **`Start Peek Pets.command`** in the project folder (first time: right-click →
**Open**). It installs the .NET 8 SDK into `~/.dotnet` if needed (no admin), builds, and runs
the companion from source. It serves `phone/` live, so edits show up on the phone after a refresh.

```bash
./tools/mac/start-companion.sh            # same thing from Terminal
dotnet test companion.tests               # companion tests (Windows + Mac)
./tools/mac/package-companion.sh arm64    # build dist/mac/…/Peek Pets Companion.app + zip
```

Useful switches (same as Windows): `--port 8790`, `--loopback` (127.0.0.1 only),
`--no-https`, `--settings <file>`, `--snapshot window.png` (save a picture of the window and quit).

## How it's built

* `companion.core/`: everything that isn't UI, shared with Windows. OS-specific parts sit
  behind small interfaces in `Platform/`:
  * cursor, buttons and monitors: CoreGraphics (`CGEventGetLocation`, `CGEventSourceButtonState`,
    `CGGetActiveDisplayList`), in the same top-left global coordinates as Windows;
  * battery: `pmset -g batt`; idle time: `CGEventSourceSecondsSinceLastEventType`;
  * Bonjour: the system `dns_sd` API;
  * the HTTPS CA key: a file only your user can read (`certs/ca.p12`, 0600 in a 0700 folder).
    Windows encrypts it with DPAPI; on the Mac, FileVault covers the disk. Keychain storage is a
    possible hardening later.
* `companion.mac/`: the Avalonia window (same layout as the Windows Phone tab).
* CI (`.github/workflows/companion.yml`) builds and tests Windows and Mac on every change,
  packages the app for both Mac processors, smoke-tests it, and on `main` publishes the zips to
  the `companion-latest` release the installer downloads.

Design notes: [superpowers/specs/2026-10-05-mac-companion-design.md](superpowers/specs/2026-10-05-mac-companion-design.md).
