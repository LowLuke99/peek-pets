# Getting Peek Pets onto your Mac (and onto your iPhone from there)

**Why a Mac:** with Xcode you can install the real iPhone app straight from your Mac with a
free Apple ID: no Sideloadly, no iTunes, and renewing every 7 days is one click (▶).
The companion (the cursor half) runs on the Windows PC **or on the Mac itself**: see
[MAC-COMPANION.md](MAC-COMPANION.md). This page is only about building the iPhone app.

You need: a Mac with **Xcode** (free, Mac App Store, ~10 GB) and your iPhone + cable.

## 1. Get the project onto the Mac (pick one)

**A. GitHub Desktop (easiest, keeps it up to date)**
1. Install [GitHub Desktop](https://desktop.github.com) on the Mac, sign in as LowLuke99.
2. *File → Clone Repository → peek-pets* → choose a folder (e.g. your home folder).

**B. Terminal with the GitHub CLI**
```bash
brew install gh && gh auth login
```
```bash
gh repo clone LowLuke99/peek-pets ~/peek-pets
```

**C. No Git at all:** on github.com open LowLuke99/peek-pets → green **Code** button →
**Download ZIP**, unzip it. (Updating later = download again.)

## 2. One command does the rest

Double-click **`Set up on Mac.command`** in the project folder (first time: right-click →
**Open** → **Open**, because it was downloaded). Or in Terminal:

```bash
cd ~/peek-pets && ./tools/mac/setup-mac.sh
```

It checks Xcode and Node.js (installs Node with Homebrew if you have it; otherwise tells
you to get it from nodejs.org), installs the app's packages, copies the pet into the iPhone
project, and opens Xcode.

## 3. In Xcode (2 minutes, first time only)

1. Left sidebar: click **App** (blue icon) → target **App** → **Signing & Capabilities**.
2. Tick **Automatically manage signing**. **Team → Add an Account…** → sign in with your
   Apple ID → pick **"Your Name (Personal Team)"**.
   *"Bundle identifier is not available"?* Run
   `./tools/mac/setup-mac.sh --bundle-id com.yourname.peekpets` and try again.
3. Plug in the iPhone, unlock it, tap **Trust**. Choose it in the device menu at the top.
4. Press **▶ Run**. The first time, on the iPhone:
   * **Settings → Privacy & Security → Developer Mode → On** (it restarts), and
   * **Settings → General → VPN & Device Management → your Apple ID → Trust**.
5. Open **Peek Pets** → allow **Local Network** → tap your computer → type the code from the
   companion window (Windows PC or Mac). Done.

After the first cable run you can tick **Connect via network** in *Window → Devices and
Simulators*, and later installs work over Wi-Fi.

## Keeping it fresh

* **New version from me:** `./tools/mac/setup-mac.sh --update` (or *Fetch/Pull* in GitHub
  Desktop then run the script), then **▶** in Xcode.
* **Free Apple ID = 7-day apps.** When the app stops opening, plug in and press **▶** again.
  Your pet, bond, outfits and backdrop are kept.

## Verified

The setup script runs on a fresh macOS runner in GitHub Actions on every change
([Mac setup check](../.github/workflows/mac-setup.yml)): Xcode and Node checks, package
install, web app sync, custom bundle ID, then an unsigned build of the app. What it can't
check is your Apple ID signing and the iPhone itself.
