# Live Calendar Sync

Sign into the KidsSync website and the mobile app with the same email and
password to see the same calendars and plans. Each client subscribes to changes
to the account's `family_schedules` row under Supabase row-level security.

Run `supabase/live-sync.sql` once in the project's Supabase SQL Editor to enable
the publication. Deploy `assets/live-sync.js` and
`assets/cloud-snapshot-sync.js` with `index.html` and `sw.js`. Open the latest
website and load the updated mobile project in Expo Go to test the same release.

Live changes normally arrive after the save and database round trip. The
website and the foreground mobile app also refresh every five seconds to
catch missed notifications.

Remote updates preserve the current calendar, date, view, and child filters.
Updates wait while a dialog is open or local changes are being saved. Returning
to the tab, reconnecting, or closing the dialog catches up without a page reload.
Background mobile browsers may suspend connections until the app is foregrounded.

## Verification

Use the same account on the website and in the mobile app. Create a temporary
plan on the website, edit it in the app, and delete it on the website. Verify
each change appears on the other client and the sync status returns to saved
or up to date. Repeat with an editor open on the website. Its inputs should
stay intact and the latest schedule should arrive after the editor closes.

Before writing an owner calendar, the website and app check the server version.
Nonoverlapping changes can sync together. If both clients make incompatible
changes, the local edit stays pending and the other client's saved version
remains on the server. In the website's sync settings, **Back up and load cloud
copy** downloads a copy of the local calendar before loading the server
version. In the app, use **Review changes** to see the pending change. Mobile
appearance preferences stay on that device.
