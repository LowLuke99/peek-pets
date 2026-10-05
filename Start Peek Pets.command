#!/bin/bash
# Double-click me on a Mac to run Peek Pets Companion from this checkout (the Mac version of
# "Start Peek Pets.cmd"). Installs the .NET 8 SDK into ~/.dotnet the first time if needed
# (no admin password). Serves phone/ live, so edits show up on the phone after a refresh.
cd "$(dirname "$0")" || exit 1
bash tools/mac/start-companion.sh "$@"
status=$?
if [[ $status -ne 0 ]]; then
  echo
  read -r -p "Something went wrong (see above). Press Enter to close this window."
fi
exit $status
