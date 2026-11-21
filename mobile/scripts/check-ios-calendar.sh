#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
test_dir="$script_dir/../ui-tests"

# Pin the connection to one booted iPhone 16 Pro. Never pick another phone
# because it happens to be the frontmost Device Hub window.
device_id="$(xcrun simctl list devices booted --json | python3 -c '
import json, sys
devices = [d for group in json.load(sys.stdin)["devices"].values()
           for d in group if d["name"] == "iPhone 16 Pro" and d["state"] == "Booted"]
if len(devices) != 1:
    sys.exit("Expected exactly one booted iPhone 16 Pro; no other device was selected.")
print(devices[0]["udid"])
')"
xcrun simctl get_app_container "$device_id" host.exp.Exponent app >/dev/null

output_dir="$(mktemp -d "${TMPDIR:-/tmp}/kidssync-calendar-ui.XXXXXX")"
printf 'Checking iPhone 16 Pro (%s)\nResults: %s\n' "$device_id" "$output_dir"
if ! xcodebuild test -quiet \
    -project "$test_dir/KidsSyncUITests.xcodeproj" \
    -scheme KidsSyncUITests \
    -destination "platform=iOS Simulator,id=$device_id" \
    -derivedDataPath "$output_dir/build" \
    -resultBundlePath "$output_dir/calendar.xcresult" \
    -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO \
    >"$output_dir/xcodebuild.log" 2>&1; then
    tail -60 "$output_dir/xcodebuild.log"
    exit 1
fi
xcrun xcresulttool export attachments --path "$output_dir/calendar.xcresult" \
    --output-path "$output_dir/screenshots"
printf 'Native navigation passed. Inspect the screenshots to verify the hourly lines.\n'
