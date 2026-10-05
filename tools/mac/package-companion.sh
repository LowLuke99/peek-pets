#!/usr/bin/env bash
# Builds "Peek Pets Companion.app" for macOS: self-contained (no .NET needed on the Mac),
# ad-hoc signed, zipped for the GitHub release that install-companion.sh downloads.
#
#   ./tools/mac/package-companion.sh                 both arm64 (Apple silicon) and x64 (Intel)
#   ./tools/mac/package-companion.sh arm64           just one
#
# Output: dist/mac/<arch>/Peek Pets Companion.app, dist/mac/PeekPets-Companion-mac-<arch>.zip
#         and dist/mac/SHA256SUMS (checked by install-companion.sh)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"
ARCHES=("${@:-arm64 x64}")
read -r -a ARCHES <<< "${ARCHES[*]}"
APP_NAME="Peek Pets Companion"
EXE="PeekPets.Companion.Mac"
BUNDLE_ID="com.lowluke.peekpets.companion"
VERSION="$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' Directory.Build.props | head -1)"
BUILD="$(git rev-list --count HEAD 2>/dev/null || echo 1)"

say() { printf '\033[1;35m🐾 %s\033[0m\n' "$*"; }

for arch in "${ARCHES[@]}"; do
  case "$arch" in arm64|x64) ;; *) echo "Unknown arch: $arch (use arm64 or x64)"; exit 2 ;; esac
  out="dist/mac/$arch"
  app="$out/$APP_NAME.app"
  say "Publishing ${arch}…"
  rm -rf "$out"
  dotnet publish companion.mac -c Release -r "osx-$arch" --self-contained true \
    -p:UseAppHost=true -p:DebugType=none -o "$out/publish" -v q --nologo

  say "Bundling $app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  cp -R "$out/publish/." "$app/Contents/MacOS/"
  cp companion.mac/AppIcon.icns "$app/Contents/Resources/AppIcon.icns"
  cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleExecutable</key><string>$EXE</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUILD</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.entertainment</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSLocalNetworkUsageDescription</key><string>Peek Pets talks to your iPhone over your home Wi-Fi so your pet can follow this Mac's cursor.</string>
  <key>NSBonjourServices</key><array><string>_peekpets._tcp</string></array>
</dict>
</plist>
PLIST
  plutil -lint "$app/Contents/Info.plist" >/dev/null

  # Ad-hoc signature: required for Apple silicon to run it; not a Developer ID (see docs/MAC-COMPANION.md).
  codesign --force --deep --sign - "$app"
  codesign --verify --deep "$app"

  zip="dist/mac/PeekPets-Companion-mac-$arch.zip"
  rm -f "$zip"
  ditto -c -k --sequesterRsrc --keepParent "$app" "$zip"
  say "Done: $zip ($(du -h "$zip" | cut -f1))"
done

(cd dist/mac && shasum -a 256 PeekPets-Companion-mac-*.zip > SHA256SUMS)
say "Checksums: dist/mac/SHA256SUMS"
