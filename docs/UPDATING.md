# Updates: one release for Mac and Windows

Every change merged to `main` builds, tests and publishes **both** desktop apps together to the
[`companion-latest`](https://github.com/LowLuke99/peek-pets/releases/tag/companion-latest) release:

| File | For |
|---|---|
| `PeekPets-Companion-mac-arm64.zip` | Macs with Apple silicon (M1 and later) |
| `PeekPets-Companion-mac-x64.zip` | Intel Macs |
| `PeekPets-Companion-windows-x64.zip` | Windows 10 / 11 |
| `SHA256SUMS` | checked by both installers before installing anything |

## Getting an update (you and friends)

Run the same line you installed with. It replaces the app and keeps your settings and paired phones.

**Mac** (Terminal):
```bash
curl -fsSL https://raw.githubusercontent.com/LowLuke99/peek-pets/main/tools/mac/install-companion.sh | bash
```

**Windows** (PowerShell: Start → type *PowerShell* → Enter):
```powershell
irm https://raw.githubusercontent.com/LowLuke99/peek-pets/main/tools/windows/install-companion.ps1 | iex
```

The phone half (the pet itself) is served by the companion, so it updates with it: refresh the page
or reopen the installed app on the iPhone.

## Shipping an update (Luke)

1. Make the change on a branch (`git checkout -b my-change`).
2. Bump the version once, in [`Directory.Build.props`](../Directory.Build.props) (e.g. `0.5.0` → `0.6.0`).
   It's shared by the Windows app, the Mac app and the core.
3. Open a pull request. CI (*Companion (Windows + Mac)*) builds and tests both apps, packages them and
   runs both installers.
4. Merge when it's green. CI publishes the new zips to `companion-latest` within ~5 minutes.
5. Tell friends to run their install line again.

## Running from the project (developers)

After `git pull`, just start it again: both launchers rebuild what changed.

| | |
|---|---|
| Mac | double-click `Start Peek Pets.command` |
| Windows | double-click `Start Peek Pets.cmd` |

The native iPhone app is separate: `./tools/mac/setup-mac.sh --update`, then ▶ in Xcode
([MAC-SETUP.md](MAC-SETUP.md)).
