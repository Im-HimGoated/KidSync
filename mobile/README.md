# KidsSync phone app

The Expo/React Native app uses the existing Supabase project and accounts. It is
an independent native UI; the desktop website remains at the repository root.

See [FEATURE_ACCESS.md](FEATURE_ACCESS.md) for the connected setup, preview,
account and feature navigation inventory, and [QA.md](QA.md) for verified results.

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

Get started opens five optional setup questions, followed by a review with an
Edit button for each answer. Save & continue opens Create your account, with
Sign in at the bottom and Preview the calendar first as an account-free option.
Welcome also offers Try the calendar without an account for people who want to
explore first. Returning to setup restores unfinished questions or saved review.

The preview opens a blank, editable ten-minute calendar. The timer counts only
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

Successful import selects and opens the new real calendar. An unfinished preview
event is not imported as a saved event: Review unfinished preview plan keeps its
details accessible to the account that claimed it, with instructions to finish
the plan through Calendar. Another account cannot open that retained draft.

## Signed-in calendar

Signed-in users open on a compact Home view instead of a second stack of calendar
headers. Home summarizes today's count, the next seven days, plans that still need
an assigned handoff adult, upcoming activities and workload by child. Selecting an
upcoming or handoff item opens the calendar on that date. Multiple calendars are
available as compact selectors without hiding the active family context.

Ordinary Calendar entry opens Today using the saved view and preferred hours.
Timed Home plans and reminder targets carry their actual start time into Week;
all-day or invalid clocks use the saved hour instead. Repeated external opens
re-center the timeline, while manual browsing and saved-view actions remain
local. Returning from setup clears an old event focus so changed preferences
apply without replaying a previous date or time.

Home, Calendar and Family remain one tap away in persistent bottom navigation.
The account avatar opens a single settings sheet for calendar preferences, saved
app language, help, the web calendar and confirmed sign out, so those occasional
actions do not compete with daily planning. Pull to refresh and the compact sync
state are available on Home as well as Calendar. The signed-in shell keeps only
one KidsSync header and uses the same calm, high-contrast palette throughout.

Calendar's Share shortcut opens Family for the selected owned calendar. Home
shortcuts restore the owned calendar context before opening a date, even if a
shared calendar was previously selected. Account → Calendar preferences reopens
the saved answer review; Back returns directly to the originating workspace.

Family provides three focused areas. People lets an owner invite an adult and
assign Viewer, Commenter or Editor access. Inbox lets a signed-in recipient accept
or decline invitations and pickup requests. Pickups lets the owner assign a saved
activity occurrence to an accepted calendar member and wait for confirmation.
The tab badge counts pending invitations and pickup requests for the current
account. Accepted shared calendars open directly in the full calendar. Its
Comments action shows the selected calendar's conversation; posting requires
owner, commenter or editor access. The People comments shortcut opens that same
real calendar rather than a separate summary.

Collaboration changes use server-backed helpers and are re-read before the app
reports success. Invitation links use the native share sheet; KidsSync does not
claim that an email was sent. Accepted calendars open in the native calendar,
with owner and calendar IDs kept together so equal IDs cannot cross scopes.
Viewer and Commenter access stays read-only. Editor saves, occurrence changes and
Undo require the checked RPC in `supabase/mobile-shared-calendar.sql`. Until that
additive migration is deployed, calendars remain readable and show that a server
update is required; the native app never falls back to the older blind writer.
Shared changes require an online server confirmation and never enter the owner
offline queue. Foreground catch-up refreshes shared data, removes revoked access,
and makes interrupted connections read-only until fresh access is confirmed.

Owner calendars use a device-backed sync queue. Cached plans reopen without a
connection, and ordinary activity creates, edits and deletes are written to
AsyncStorage before the UI reports “Saved on phone.” Reconnect replays each
intent against a fresh server snapshot. Concurrent changes stop at a review
screen instead of overwriting either version; the user may retry or explicitly
discard the device queue. Pending changes are scoped per account, capped at 50,
and never enter another account after sign-out. Calendar creation, recurring
occurrence operations, undo and trial import still require an online confirmed
write and are handed back to the same sync controller after success.

The phone calendar provides Agenda, Week and Month views, date navigation,
Today, calendar selection and explicit calendar creation. Week shows a few
readable day columns at once, with synchronized horizontal scrolling across the
full seven days, a 24-hour timetable and all-day band; full-size agenda cards provide
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
  saved starting hours and reminder choice. Choosing a lead time alone does not
  request notification permission or turn reminders on.

Preferences are not cloud-synced. The account button opens scrollable native
settings, calendar preferences, appearance, phone reminders, English/Chinese
language selection, help and confirmed sign out. Language is remembered on this
device. Sheets respect Reduce Motion and native accessibility escape.

## Appearance

Appearance offers Device default, Light and Dark with Sage, Ocean, Lavender and
Rose accents. A compact live preview updates the calendar, forms and settings.
Choices are device-local, isolated between accounts and a separate guest profile.
An account switch uses safe defaults while that profile loads; a failed write is
identified as preview-only and can be retried. Reset changes appearance only.
Theme factories use semantic surfaces and on-primary text instead of treating
literal white as both background and foreground.

## Local phone reminders

Phone reminders are off by default. A signed-in user can enable them in Account
settings; only that explained action can request OS notification permission.
Permission-denied states offer system settings and retry. Lock-screen text is
generic and excludes activity names, people and locations. There is no push-token
registration, remote push, email delivery, sound permission or exact-alarm grant.

The SDK-compatible `expo-notifications` package is installed and the app shell
mounts `useLocalReminders` once, including through sign-out. It reconciles only
complete confirmed owner calendars; cached optimistic edits and shared calendars
are not scheduling inputs. Queued changes reconcile after successful sync.
Account changes cancel this feature's notices from the previous account before
waiting for the new calendar to load. Notification taps validate the current
account/calendar/event before navigating to the calendar date.

The service schedules a rolling 14-day window, capped at 48 managed notices minus
unrelated pending notices. Reopen KidsSync regularly to replenish that window.
Other-device edits update local reminders when this app reconnects. Delivery is
best-effort and can be delayed or silenced by Focus, OS settings or battery limits.

### Reminder lifecycle contract

`src/lib/local-reminders.js` remains injectable for isolated tests. The app's
`use-local-reminders.js` and `reminder-lifecycle.js` own the native integration:

- Create one `createLocalReminderService({ notifications, storage, platform })`
  per process, passing the Expo module and AsyncStorage.
- Only an explained user action may call
  `configure(userId, { enabled, showTitles: false, userInitiated: true })`.
  This is the only permission-request path. Defaults are off, with generic
  lock-screen text. Revealing titles requires a separate deliberate choice.
- Call `synchronize({ userId, calendars, language, isCurrent })` after a complete,
  successfully loaded owner snapshot, confirmed create/edit/delete/import,
  foreground/timezone changes, and account changes. Never synchronize an empty
  loading placeholder. Pass `userId: null` on logout to cancel only this service's
  notices. Use `cancelForUser(userId)` for explicit cleanup.
- Numeric `reminderMinutes: 0 | 10 | 30` is used; null or invalid values do not
  schedule. The planner includes the next 14 calendar days, with at most 48
  managed pending notices minus unrelated pending notices. Recurring starts and
  exceptions are honored. All-day reminders use 9 AM local time minus the lead;
  multi-day trips notify only on occurrence starts. DST-gap times are skipped.
- `notificationTarget(notification, currentUserId)` validates tap metadata before
  navigation. Integrators must supply an appropriate Expo foreground handler;
  this service does not replace another feature's global notification handler.

Deterministic identifiers reconcile edits/deletions without cancelling unrelated
notices. A `scheduled` result confirms an SDK scheduling request, not that the OS
displayed it. Isolated tests cannot establish permission-prompt or delivery
behavior; actual device results are tracked separately in `QA.md`.

API reference: [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/).

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
version can still overwrite a snapshot. Native calendar sharing requires the
existing calendar-member schema and RPCs. Pickup responsibility additionally
requires `supabase/family-coordination.sql` in the connected project.

Native shared editing additionally requires the reviewed additive
`supabase/mobile-shared-calendar.sql` migration. Deployment and non-mutating
verification queries are in `supabase/mobile-shared-calendar-review.md`. This
source migration does not change table grants or RLS policies and has not been
applied merely by installing the app. The older web writer remains outside its
checked protocol; see the review for that concurrency limit.

## Run and verify

See root README for dependency setup. From `mobile/` run `pnpm start`, `pnpm web`,
`pnpm ios` or `pnpm android` using the package-manager version in package.json.
The app uses Expo SDK 58 (React Native 0.88). Use an SDK 58-compatible Expo Go
runtime; `pnpm ios` downloads the matching simulator version. Xcode 27 uses
Device Hub instead of Simulator.app, and SDK 58 detects it automatically. The
iPhone simulator requires Xcode, accepted first-launch setup and an installed
iOS runtime. Open an iPhone in Device Hub, then run `pnpm ios` and leave Metro
running. No Simulator.app symlink or global npm upgrade is needed.

From the root run `node --test tests/*.test.cjs`. From mobile run
`pnpm check` and `pnpm export`. Bundle export and browser checks are not an
interactive simulator test. Record the release checks in `QA.md`.

Choose final application identifiers, signing credentials and Expo release
profiles before store distribution. Preserve the existing static-root Vercel
configuration; the mobile package does not change the website deployment.
