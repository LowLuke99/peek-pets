#!/usr/bin/env bash
# Peek Pets: one-command Mac setup for building the iPhone app with Xcode.
#
#   ./tools/mac/setup-mac.sh                      check tools, install app deps, sync, open Xcode
#   ./tools/mac/setup-mac.sh --update             git pull first (get my latest changes)
#   ./tools/mac/setup-mac.sh --bundle-id com.you.peekpets   use your own bundle ID (free Apple IDs need a unique one)
#   ./tools/mac/setup-mac.sh --no-open            don't open Xcode at the end
#   ./tools/mac/setup-mac.sh --ci                 non-interactive check (used by GitHub Actions)
#
# The Windows PC keeps running "Peek Pets Companion"; the Mac only builds + installs the app.
set -euo pipefail

UPDATE=0 OPEN=1 CI_MODE=0 BUNDLE_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --update) UPDATE=1 ;;
    --no-open) OPEN=0 ;;
    --ci) CI_MODE=1; OPEN=0 ;;
    --bundle-id) BUNDLE_ID="${2:-}"; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)"; exit 2 ;;
  esac
  shift
done

say()  { printf '\033[1;35m🐾 %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '   \033[31m✗ %s\033[0m\n' "$*"; exit 1; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"
say "Peek Pets Mac setup in $REPO"

# 1. macOS + Xcode ------------------------------------------------------------------
[[ "$(uname -s)" == "Darwin" ]] || fail "This script is for macOS. (On Windows, use 'Start Peek Pets.cmd'.)"
if ! xcodebuild -version >/dev/null 2>&1; then
  fail "Xcode not found. Install Xcode from the Mac App Store, open it once to finish setup, then run this again.
     (If Xcode is installed: sudo xcode-select -s /Applications/Xcode.app)"
fi
ok "$(xcodebuild -version | head -1)"

# 2. Node.js 20+ ----------------------------------------------------------------------
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [[ "$(node_major)" -lt 20 ]]; then
  if command -v brew >/dev/null 2>&1; then
    say "Installing Node.js with Homebrew…"
    brew install node
  else
    fail "Node.js 20+ is needed. Install it from https://nodejs.org (LTS) or with Homebrew (https://brew.sh), then run this again."
  fi
fi
ok "Node $(node -v)"

# 3. Latest code --------------------------------------------------------------------
if [[ $UPDATE -eq 1 ]]; then
  if [[ -d .git ]]; then
    say "Getting the latest version…"
    git pull --ff-only
    ok "Up to date ($(git log -1 --format='%h %s'))"
  else
    echo "   (not a git checkout: skipping --update; download the ZIP again to update)"
  fi
fi

# 4. App dependencies + web app sync --------------------------------------------------
say "Installing the app's packages…"
(cd app && npm ci --no-audit --no-fund)
ok "Packages installed"

if [[ -n "$BUNDLE_ID" ]]; then
  [[ "$BUNDLE_ID" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]] || fail "Bundle ID should look like com.yourname.peekpets"
  sed -i '' "s/PRODUCT_BUNDLE_IDENTIFIER = [^;]*;/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;/g" app/ios/App/App.xcodeproj/project.pbxproj
  ok "Bundle ID set to $BUNDLE_ID"
fi

say "Copying the pet into the iPhone project…"
(cd app && npm run sync --silent)
[[ -f app/ios/App/App/public/index.html ]] || fail "Sync didn't produce app/ios/App/App/public/index.html"
ok "Web app synced ($(find app/ios/App/App/public -type f | wc -l | tr -d ' ') files)"

# 5. Open Xcode -----------------------------------------------------------------------
if [[ $CI_MODE -eq 1 ]]; then
  say "CI check passed."
  exit 0
fi
cat <<'NEXT'

  Next, in Xcode (about 2 minutes):
    1. Left sidebar: click "App" (blue icon) → target "App" → "Signing & Capabilities".
    2. Tick "Automatically manage signing", Team → "Add an Account…" → sign in with your Apple ID,
       then pick "<your name> (Personal Team)".
       If it says the bundle ID is taken, re-run:  ./tools/mac/setup-mac.sh --bundle-id com.<yourname>.peekpets
    3. Plug in the iPhone (unlock it, tap "Trust"). Pick it in the device menu at the top.
    4. Press ▶ (Run). First time only, on the iPhone:
         Settings → Privacy & Security → Developer Mode → On (restarts), and
         Settings → General → VPN & Device Management → your Apple ID → Trust.
    5. Open Peek Pets, allow "Local Network", tap your PC, type the code from the companion window.

  Free Apple IDs: the app lasts 7 days. Just press ▶ again in Xcode to renew (your pet is kept).
  Later updates:  ./tools/mac/setup-mac.sh --update   then ▶ in Xcode.

NEXT
if [[ $OPEN -eq 1 ]]; then
  say "Opening Xcode…"
  (cd app && npx cap open ios)
fi
