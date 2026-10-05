#!/usr/bin/env bash
# Installs Peek Pets Companion on a Mac in one line (no developer tools, no .NET needed):
#
#   curl -fsSL https://raw.githubusercontent.com/LowLuke99/peek-pets/main/tools/mac/install-companion.sh | bash
#
# Downloads the latest build for this Mac (Apple silicon or Intel) from GitHub, puts
# "Peek Pets Companion.app" in ~/Applications and opens it. Run it again to update.
# The zip is checked against the release's SHA256SUMS before anything is installed.
# Testing overrides: PEEKPETS_COMPANION_URL + PEEKPETS_SUMS_URL (file:// works), PEEKPETS_INSTALL_DIR,
# PEEKPETS_NO_OPEN=1.
set -euo pipefail

REPO="LowLuke99/peek-pets"
TAG="companion-latest"
APP_NAME="Peek Pets Companion"
DEST="${PEEKPETS_INSTALL_DIR:-$HOME/Applications}"

say()  { printf '\033[1;35m🐾 %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fail "This installer is for macOS. On Windows, use 'Start Peek Pets.cmd' from the project."
major="$(sw_vers -productVersion | cut -d. -f1)"
[[ "$major" -ge 12 ]] || fail "Peek Pets Companion needs macOS 12 (Monterey) or newer."

case "$(uname -m)" in
  arm64) arch="arm64" ;;
  x86_64) arch="x64" ;;
  *) fail "Unsupported Mac processor: $(uname -m)" ;;
esac

zip_name="PeekPets-Companion-mac-$arch.zip"
url="${PEEKPETS_COMPANION_URL:-https://github.com/$REPO/releases/download/$TAG/$zip_name}"
sums_url="${PEEKPETS_SUMS_URL:-https://github.com/$REPO/releases/download/$TAG/SHA256SUMS}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

say "Downloading Peek Pets Companion ($arch)…"
curl -fL --progress-bar "$url" -o "$tmp/companion.zip" || fail "Download failed: $url"
curl -fsSL "$sums_url" -o "$tmp/SHA256SUMS" || fail "Couldn't download the checksums: $sums_url"
expected="$(awk -v f="$zip_name" '$2 == f || $2 == "*"f { print $1 }' "$tmp/SHA256SUMS")"
actual="$(shasum -a 256 "$tmp/companion.zip" | awk '{ print $1 }')"
[[ -n "$expected" && "$expected" == "$actual" ]] || fail "Checksum mismatch for $zip_name: the download is damaged or not the published build. Nothing was installed."

say "Installing to ${DEST}…"
mkdir -p "$DEST"
if pgrep -f "$APP_NAME.app/Contents/MacOS/" >/dev/null 2>&1; then
  osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1 || true
  sleep 1
fi
ditto -x -k "$tmp/companion.zip" "$tmp/unzipped"
[[ -d "$tmp/unzipped/$APP_NAME.app" ]] || fail "The download didn't contain $APP_NAME.app"
rm -rf "$DEST/$APP_NAME.app"
mv "$tmp/unzipped/$APP_NAME.app" "$DEST/"
# curl downloads aren't quarantined, but clear it anyway so Gatekeeper doesn't block the
# unsigned (ad-hoc) app. Only this app is touched.
xattr -dr com.apple.quarantine "$DEST/$APP_NAME.app" 2>/dev/null || true

if [[ "${PEEKPETS_NO_OPEN:-}" == "1" ]]; then say "Installed $DEST/$APP_NAME.app"; exit 0; fi
say "Opening it. If macOS asks to accept incoming network connections, click Allow."
open "$DEST/$APP_NAME.app"
cat <<'NEXT'

  On your iPhone (same Wi-Fi): open the Camera, point it at the QR code in the window,
  tap the link. Your pet now follows this Mac's cursor.

  Update later: run the same command again.
  Remove: drag "Peek Pets Companion" from your Applications folder (in your home folder) to the Bin.

NEXT
