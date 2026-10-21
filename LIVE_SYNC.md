# Live Calendar Sync

The signed-in app subscribes to INSERT and UPDATE notifications for the current
user's `family_schedules` row. Existing Supabase row-level security remains in
force. No service-role key or new public permissions are required.

Run `supabase/live-sync.sql` once in the project's Supabase SQL Editor to enable
the publication. Keep RLS enabled. Deploy `assets/live-sync.js` with `index.html`
and `sw.js`. Each device must load the new deployment once.

Saved changes normally arrive through the WebSocket immediately after the
650 ms save debounce and database round trip. Network latency still applies.
A five-second visible-tab background check catches missed notifications and
provides automatic updates even before the publication is enabled.

Remote updates preserve the current calendar, date, view, and child filters.
Updates wait while a dialog is open or local changes are being saved. Returning
to the tab, reconnecting, or closing the dialog catches up without a page reload.
Background mobile browsers may suspend connections until the app is foregrounded.

## Verification

Use the same account in two independent browsers or on two devices. Without
reloading the receiving page, create a temporary event on the first device,
edit it on the second, and delete it on the first. Verify every change arrives
and the save status returns to "Saved to cloud". Repeat while an editor is open:
its input should remain intact, and remote updates should arrive after closing.

This is not an offline merge/CRDT system. Concurrent edits to the same stored
schedule remain last-write-wins; live delivery does not make simultaneous
whole-schedule uploads conflict-free.
