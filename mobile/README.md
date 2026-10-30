# KidsSync phone app

The Expo/React Native app uses the existing Supabase project and accounts. It is
an independent native UI; the desktop website remains at the repository root.

## Phone availability

The app flow is available on iPhone and Android handsets. Native tablets,
televisions and large screens are excluded at the app entry. The iOS build sets
`supportsTablet: false`. Mobile web requires phone user-agent, screen and touch
signals; making a desktop window narrow does not unlock the flow. These are UI
eligibility heuristics, not account authorization checks.

For deliberate development browser checks only, use a phone-width viewport and
`http://localhost:8084/?phonePreview=1`. This opt-in is ignored in production
builds. Other devices receive an entry screen linking to the existing website.

## Guest trial and personalization

Get started opens a blank, editable ten-minute calendar. The timer counts only
foreground time in that route and survives reopening; background time does not
consume the trial. Events, unfinished event drafts and the calendar profile stay
in AsyncStorage. Clock storage errors expire the trial conservatively while
retaining the plan backup. Corrupt data is reported rather than silently reset.

Add/edit/delete one-off or all-day events, including early-morning plans. The
trial currently shows a day agenda. Make your calendar yours is available from
welcome and the trial footer, and opens automatically at expiry. It saves a name,
calendar name, optional description and icon. Calendar preferences opens the five
optional questions and editable review. Account creation is the primary next
step, with Sign in at the bottom for existing users.

After authentication, Save preview to my account explicitly imports a separate
calendar. It does not replace existing calendars or profiles. A durable claim
reservation binds an attempted import to that account before network I/O, so
account switches and ambiguous network failures cannot offer the same backup to
another account. Idempotent retries, fresh owner checks and timestamp-checked
writes protect existing data. No guest trial is uploaded automatically.

## Signed-in calendar

The phone calendar provides Agenda, Week and Month views, date navigation,
Today, calendar selection and explicit calendar creation. Week includes a
scrollable 24-hour timetable and all-day band; full-size agenda cards provide
an accessible alternative to small overlapping blocks. Search and person filters
help locate plans. Event details and the editor cover title, dates/times,
all-day status, child/family, location, pickup adult, packing notes, importance,
recurrence and saved reminder metadata. Unknown event fields survive edits.
Built-in holidays and externally managed events remain read-only.

Owned calendar creation, event editing and deletion use the existing owner row
and verify authentication. Concurrent edits surface a conflict and require a
refresh rather than overwriting newer event data. The existing web snapshot,
legacy calendars and unrelated data are preserved. Realtime, foreground refresh
and periodic catch-up continue to use the shared schedule reader.

## Saved preferences

Completed answers are saved per account on this device. A calendar preferences
control reopens the editable review. Signed-in drafts have their own account key;
unfinished edits never become active preferences or leak into guest setup.

- Opening view selects Agenda/Today, Week or Month.
- Week start changes the week and month grid ordering.
- Preferred hours set the week timetable's initial scroll position.
- Planning audience is retained without inventing children or hiding real plans.
- Reminder choice initializes new event metadata. New trial events also use the
  saved starting hours and reminder choice. This does not schedule notifications
  or request notification permissions.

Preferences are not cloud-synced. Settings/theme designs, native sharing screens,
Dashboard navigation and notification delivery remain separate work.

## Accounts and backend

Native email/password signup and sign-in reuse the website's Auth accounts.
Signup validates email, matching passwords and the website's eight-character
minimum; server password policy remains authoritative. If confirmation is
required, passwords are cleared and Check your email explains how to open the
HTTPS confirmation link and return to the app to sign in. Native email/OAuth
callbacks are not configured. Password recovery uses the existing web flow.

`src/lib/supabase.js` imports `shared/backend/config.js`; never ship a secret or
service-role key. Supabase sessions persist using AsyncStorage and processLock.
AsyncStorage is not encrypted platform-keystore storage. Auth user IDs, RLS and
`public.family_schedules` are shared with the website. The version-2 snapshot
includes calendars, calendarData, profile and compatibility mirrors.

Native writes use fresh reads and compare-and-set `updated_at`. The schema does
not have a server-enforced revision, so a non-cooperating writer reusing a
version can still overwrite a snapshot. Sharing backend helpers are separate
from the currently shipped owner-calendar UI.

## Run and verify

See root README for dependency setup. From `mobile/` run `pnpm start`, `pnpm web`,
`pnpm ios` or `pnpm android` using the package-manager version in package.json.
Use an Expo Go version compatible with SDK 55. The iPhone simulator requires
Xcode, accepted first-launch setup and an installed iOS simulator runtime.

From the root run `node --test tests/*.test.cjs`. From mobile run
`pnpm check` and `pnpm export`. Bundle export and browser checks are not an
interactive simulator test. Record the release checks in `QA.md`.

Choose final application identifiers, signing credentials and Expo release
profiles before store distribution. Preserve the existing static-root Vercel
configuration; the mobile package does not change the website deployment.
