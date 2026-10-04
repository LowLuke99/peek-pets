#!/bin/bash
# Double-click me on a Mac (Finder) to set up the Peek Pets iPhone app in Xcode.
cd "$(dirname "$0")" || exit 1
bash tools/mac/setup-mac.sh "$@"
echo
read -r -p "Done. Press Enter to close this window."
