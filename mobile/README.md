# React Native App

This is a native Expo/React Native starter for both iOS and Android, separate
from the working website. It is not a full port of the web calendar yet.

## Available Now

- Compact native welcome screen with family imagery, English/Chinese support,
  native account creation, sign-in, and an explicitly labeled link to explore the website.
- Signed-in sessions skip the welcome screen; sign-in has a back-to-welcome action.
- Welcome leads with family-specific copy and includes a display-only three-day
  calendar preview with date columns, an all-day row, time grid, the website's
  event palettes, and an example pickup adult and packing note. Get started and
  Sign in stay below the scrolling content, with a clear optional-setup hint.
  Short screens use a smaller photo/grid; larger text remains scrollable.
  The welcome screen also includes
  three distinct outdoor, school and sports photos rotating every eight seconds.
  Sign-in uses a separate homework photo. Rotation pauses in
  the background, when requested, or with reduced motion enabled. A manual next
  photo control remains available. Example events are never saved to an account.

For a browser preview while Xcode is unavailable, run `npx pnpm@11.25.0 web`
from `mobile/`. This renders the React Native UI through React Native Web; it
does not replace simulator or physical-device testing. Get started opens five native guided preference questions, followed by an editable
review. Unfinished drafts resume at the same question after reopening setup. Save & continue keeps the choices on this device and opens Create account, with
Sign in fixed at the bottom for existing users. Review returns to the saved answers.
Once authenticated, choices are attached to the account’s own AsyncStorage key. Returning
users can still sign in directly. The Settings menu remains a design prototype.
These preferences do not write to Supabase or sync to other devices. The native
calendar is still a read-only activity preview; day/week/month views and scheduled
notifications are not implemented by saving these choices.
- Email/password sign-in using the **existing** Supabase accounts.
- Session persistence using AsyncStorage and Supabase's process lock.
- Own-account calendar selection and a read-only list of stored activities.
- Realtime updates from the same `public.family_schedules` rows as the web app.
- Foreground catch-up, five-second fallback reads while active, and a fresh
  database read after closing/reopening the process.
- English/Chinese interface, safe-area layout and scrollable sign-in form.
- Matching family-photo sign-in screen with keyboard navigation, password
  visibility, localized validation/errors, duplicate-request guards and reset
  email requests. Recovery links finish on the existing HTTPS web flow, without
  requiring native deep-link configuration. No social providers are implied.
- No demo children, automatic schedule creation, or mobile database writes.

`src/lib/supabase.js` imports `../../../shared/backend/config.js` directly;
no copied `.env` value or second Supabase project is needed.
The web page loads the exact same config before its app scripts. The publishable
key is public; never ship a secret or service-role key in either app.

The current native list shows stored activities, including recurrence metadata;
it does not yet expand recurring occurrences into a day/week calendar. Shared
member calendars, invitations, editing, scanning, notifications, and Google/
Outlook connections still need native screens. Their existing web features are
not silently assumed to work natively.

## Backend Contract

- Auth user IDs are identical on web and mobile when signing into the same account.
- `family_schedules.user_id` remains the row owner, protected by the existing RLS.
- `schedule` is the existing version-2 JSON snapshot: `calendars`,
  `activeCalendarId`, `calendarData`, plus legacy active-calendar fields.
- The reader supports legacy snapshots and never normalizes by writing them back.
- Existing `calendar_members`, comments and coordination tables stay unchanged.
- Realtime publication must include `family_schedules`; see `../LIVE_SYNC.md`.
- Web writes currently replace the whole snapshot (last write wins). Before
  adding native editing, agree on conflict handling; do not blindly upsert a stale
  native copy. The starter deliberately exposes no write method.
- AsyncStorage persists sessions but is not encrypted storage. Evaluate a
  platform-keystore-backed adapter before a security-sensitive public release.

## Run and Verify

Follow root `README.md` for install/start commands. Sign into an existing test
account. No password needs to be added to source or sent to anyone.

1. Open that account on the website and on the phone.
2. Create a clearly labeled temporary event on the website.
3. Confirm the phone list updates without pulling to refresh.
4. Background the phone, edit the web event, and reopen the phone app.
5. Fully close the phone app, edit again, and relaunch. Confirm the latest data.
6. Sign out and sign into another test account. Verify no prior calendar appears.
7. Delete the temporary event on the website and confirm removal on the phone.

These are physical-device acceptance steps, not a claim that a native build has
already been tested on a phone. Expo dependency validation and native export
must also pass before shipping.

## Before Distribution

Choose final iOS bundle and Android application identifiers, create signing
credentials, and add development/release build profiles for your Expo account.
They are intentionally not invented here. Generated native projects and signing
files are excluded from Git.

Account creation uses the existing Supabase email/password accounts directly in
the native app. The form validates email, matching passwords, and the same eight-character
minimum as the website; server password rules still apply. If verification is required,
the app shows Check your email and clears password fields. The confirmation link
opens the existing production HTTPS website; return to the app and sign in afterward.
Reviewed answers remain saved through that handoff. Accounts with an immediate
session enter the authenticated app. Native password recovery requests an email
whose link completes on that website. Native
email/OAuth callbacks are **not configured**. Before adding them, register a
verified app link or custom scheme on both platforms, allowlist that redirect
in the same Supabase project's Auth settings, and implement callback/session
exchange. Never use an Expo development URL as the production Site URL.

Keep Vercel's existing static-root configuration. `mobile/package.json` is local
to this app so adding React Native does not change the web deployment's build.
