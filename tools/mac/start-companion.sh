#!/usr/bin/env bash
# Runs Peek Pets Companion for macOS from source (developers / testing a checkout).
#
#   ./tools/mac/start-companion.sh              build if needed, then run
#   ./tools/mac/start-companion.sh --check      only check/install the .NET SDK and build (used by CI)
#   any other arguments are passed to the companion (e.g. --port 8790)
#
# Friends who just want the app: tools/mac/install-companion.sh (no .NET needed).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"

say()  { printf '\033[1;35m🐾 %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '   \033[31m✗ %s\033[0m\n' "$*"; exit 1; }

CHECK_ONLY=0
if [[ "${1:-}" == "--check" ]]; then CHECK_ONLY=1; shift; fi

[[ "$(uname -s)" == "Darwin" ]] || fail "This script is for macOS. (On Windows, use 'Start Peek Pets.cmd'.)"

# 1. .NET 8 SDK: use one that's installed, else install into ~/.dotnet (no admin needed).
has_sdk8() { "$1" --list-sdks 2>/dev/null | grep -q '^8\.'; }
DOTNET=""
for candidate in "$(command -v dotnet 2>/dev/null || true)" /usr/local/share/dotnet/dotnet "$HOME/.dotnet/dotnet"; do
  if [[ -n "$candidate" && -x "$candidate" ]] && has_sdk8 "$candidate"; then DOTNET="$candidate"; break; fi
done
if [[ -z "$DOTNET" ]]; then
  say "Installing the .NET 8 SDK into ~/.dotnet (one time, ~250 MB)…"
  installer="$(mktemp)"
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o "$installer" || fail "Couldn't download the .NET installer."
  bash "$installer" --channel 8.0 --install-dir "$HOME/.dotnet" --no-path >/dev/null || fail "The .NET install failed."
  rm -f "$installer"
  DOTNET="$HOME/.dotnet/dotnet"
  export DOTNET_ROOT="$HOME/.dotnet"
fi
ok ".NET SDK $("$DOTNET" --version)"

# 2. Build (quick when nothing changed).
say "Building Peek Pets Companion…"
"$DOTNET" build companion.mac -c Release -v q --nologo >/dev/null || fail "Build failed. Run: $DOTNET build companion.mac"
ok "Built"
if [[ $CHECK_ONLY -eq 1 ]]; then exit 0; fi

# 3. Run. The window stays open until you close it; closing it tells your phone "PC closed".
say "Starting… (if macOS asks to accept incoming network connections, click Allow)"
exec "$DOTNET" run --project companion.mac -c Release --no-build -- "$@"
