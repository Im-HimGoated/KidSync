# Phone release verification

## Release evidence and remaining acceptance

Welcome/sign-in navigation and the guest trial's draft recovery, early event
creation/edit/deletion and expiry handoff have been exercised on iPhone Duo /
iOS 27.1. Signed-in calendar, two-way website sync, offline queued-edit recovery,
planning tools, preferences, existing shared Viewer access and final date/time
focus have passed on iPhone 16 Pro / iOS 26.5. Live Editor/Commenter mutation,
notification delivery, physical devices and store distribution remain unverified.
Browser fixtures and bundle exports are recorded separately from actual native
checks below. This is a tested development release.

## Acceptance sequence

1. Open the app on an iPhone simulator and confirm welcome, text wrapping,
   keyboard avoidance, scrolling, safe areas and all primary touch targets.
2. Start a blank trial, create an early timed event and an all-day plan, edit and
   delete, and reopen the app to confirm event and unfinished-draft recovery.
3. Background/foreground and leave/re-enter trial; confirm elapsed time is
   preserved. At expiry, confirm personalization opens and plans remain saved.
4. Personalize, answer all five questions, review/edit, return, and open Create
   account. Verify the secondary Sign in route and validation in EN and ZH.
5. Sign into a test account. Explicitly import preview plans as a new calendar;
   confirm existing account calendars/profile are preserved and retry is safe.
6. Exercise Agenda, Week, Month, Today, previous/next, date jump, search, person
   filter, calendar creation, event creation/edit/deletion and conflict refresh.
7. Change preferences, reopen, sign out and switch account. Confirm opening view,
   week start, initial week scroll and new-event reminder metadata are applied
   without exposing another account's choices. No notification delivery is implied.
8. In Family, create Viewer, Commenter and Editor invitations. Confirm recipient
   Inbox accept/decline, comments, role changes, removal, pickup assignment and
   pickup accept/decline with two real accounts. Confirm no UI claims an email was
   sent, revoked access disappears, and Viewer remains read-only.
9. Verify tablet and desktop exclusion independently. Narrowing a desktop window
   must not unlock the app. Only an explicit development preview opt-in may do so.
10. Run the full suite, native exports and isolated Git diff checks against the
   final release snapshot, then push the reviewed mobile-only changes.

## Preparation checks

Pure tests cover date/recurrence, layout, CRUD and CAS, unknown-field preservation,
account preference isolation, phone eligibility, trial retention, clock failure,
claim reservations, import validation and idempotency. Native bundle export has
succeeded during integration; rerun if implementation changes. Interactive live
account and iPhone simulator checks remain pending until performed above.

## Preparation results (2026-10-29)

- Isolated release snapshot: 451 automated tests passed; iOS and Android bundle
  exports succeeded.
- Browser checks at 390px: phone-only desktop entry, explicit development preview,
  blank trial creation, early event save, reopening with retained event/time,
  personalization, preferences review/save/return, and native signup handoff passed.
- Fixture-only calendar browser checks: Week/Sunday/afternoon defaults, switching
  preferences to Month/Monday/evening, planning-audience label, reminder defaults,
  activity create/edit/delete, preserving other plans, separate calendar creation,
  calendar switching, Agenda/search, and Chinese at 320px passed without live writes.
- Actual iPhone simulator and live-account checks remain unperformed. Xcode and
  an iOS runtime are not yet installed; this is still the release/push gate.

## Mobile experience pass (2026-10-30)

- Added a native signed-in Home view with today/seven-day metrics, chronological
  Next up plans, handoff attention and per-child workload. Home rows jump to the
  matching calendar date.
- Replaced the duplicate signed-in header stack with one compact brand header,
  Home/Calendar bottom navigation and an account sheet for preferences/sign out.
- Focused home/calendar logic tests passed. Existing auth, onboarding, phone
  access, calendar, recurrence and native-trial focused suites passed.
- Expo dependency validation passed using the installed offline dependency map.
  Web, iOS and Android production exports succeeded. Production mobile-web entry
  was checked at 390px and 320px with no horizontal overflow or console errors.
- Signed-in Home still requires the live-account and iPhone simulator acceptance
  sequence above before this can be called a completed native release check.

## Family collaboration pass (2026-10-30)

- Added a native Family destination with People, Inbox and Pickups sections,
  Viewer/Commenter/Editor permissions, invitation links, shared comments and a
  pending-action badge in the bottom navigation.
- Added server-confirmed pickup assignment and recipient response helpers using
  the existing family-coordination RPCs. The UI does not directly mutate schedule
  rows or simulate server permission changes.
- Focused family/sharing/coordination tests passed. The full repository suite
  passed 563 tests after sync integration. Expo dependency validation passed from the installed offline
  map, and web, iOS and Android production exports succeeded.
- The fresh production mobile-web entry passed 320px and 390px checks without
  horizontal overflow, page errors or console errors.
- Live two-account invitation/pickup acceptance remains pending. The connected
  Supabase project must include the calendar-member RPCs and
  `supabase/family-coordination.sql`. Native shared-event editing still uses the
  web calendar until the shared-editor adapter is connected.

## Shared mobile polish and reminder foundation (2026-10-30)

- Shared contrast-checked palette, matching sign-in/sign-up/personalization
  styling, shorter small-screen sign-in imagery, persisted EN/ZH language,
  reduced-motion sheets and native accessibility escape are implemented locally.
- Account settings exposes preferences, language, specific expandable help,
  web-calendar handoff and confirmed sign-out. Isolated component checks at
  320px and 390px verified EN/ZH wrapping, Help close, failed sign-out feedback
  and cancellation. Fixture callbacks did not connect to a real account.
- The production-entry phone preview verified sign-in validation and persisted
  Chinese language across reload. The original English choice was restored.
- The local project rendered its guest trial on the booted iPhone Duo/iOS 27.1
  cover display. This is visual native evidence, not completion of the full
  authenticated acceptance sequence or physical-phone testing.
- The integrated repository suite passed 563 tests and iOS/Android bundle exports
  succeeded. Reminder/core UI focused tests cover permission denial, provisional
  permission, recurrence/exceptions, DST, account isolation, stale scope,
  create/edit/delete reconciliation, duplicate prevention and native failures.
- `local-reminders.js` is injection-ready only. SDK package installation,
  app/foreground-handler integration, explicit user permission and notification
  delivery tests remain pending. No real permission prompt was accepted, no
  notification was scheduled on a real runtime, and no push was performed here.

## Offline owner sync integration (2026-10-30)

- Replaced the signed-in shell's duplicate schedule watcher/poll path with the
  device-backed owner sync controller. Home, Calendar and Family now read one
  account-scoped projected snapshot.
- Ordinary activity create/edit/delete actions persist to the device queue before
  network replay. The compact sync bar distinguishes cached, offline, pending,
  syncing, conflict, auth and storage states, and confirms destructive discard.
- Calendar creation, recurring occurrence changes, undo and trial import remain
  confirmed online operations; confirmed rows are accepted by the controller.
- Queue/cache tests cover account isolation, restarts, failed disk writes, lost
  responses, concurrent changes, all-day normalization, a 50-intent cap and
  background polling without status flicker. The full suite passed 563 tests and
  web, iOS and Android production exports succeeded.
- No live account, real offline-to-online device transition, two-account conflict,
  or physical-phone recovery sequence was performed. Those remain release
  acceptance checks; browser/export evidence does not replace them.

## Frozen mobile-only release snapshot (2026-10-30)

- `codex/phone-calendar-release` contains the integrated Home, Family, account,
  calendar/occurrence/undo, trial, personalization, phone gating and owner-sync
  changes with Expo SDK 58. Unrelated website edits and their extra tests are
  excluded from this snapshot.
- All **559** tests in this isolated snapshot passed. Fresh iOS and Android
  production bundle exports succeeded. Source matches the frozen owners' files;
  only these release-evidence notes were added afterward.
- The queue's overnight regression permits 23:00 through next-day midnight and
  rejects an end before the start on the same date. Conflict review retains the
  device, original and latest downloaded account versions; retry cannot force an
  overwrite. Offline deletion has no server Undo token and does not advertise one.
- Notification delivery is disabled. Live authenticated native sync/import,
  real-device offline recovery, and two-account sharing checks remain pending.
  Publication of this development snapshot does not claim those checks passed.

## Remaining-feature implementation (2026-10-30)

- Appearance is implemented across Home, Family, Calendar, forms, trial, account
  settings and sync review: System/Light/Dark plus four accent palettes, with
  device-local guest/account isolation, live preview, reset and honest failure
  feedback. Real-component browser checks covered persistence, rapid/deferred
  saves across account switches, EN/ZH, 320px/390px layouts and selected radio
  semantics. The short-phone welcome scroller no longer sits behind its CTA.
- Local reminders are installed and connected to the signed-in shell/settings.
  They are off by default, require a deliberate opt-in and use generic content.
  Lifecycle tests cover confirmed snapshots, account cleanup, permission denial,
  edit/delete reconciliation and validated tap routing. Actual Expo Go on iPhone
  16 Pro / iOS 26.5 loaded the isolated reminder hook with disabled state and zero
  scheduled notices. The Mac locked before the permission/scheduling test; no OS
  permission or display result is claimed. The temporary harness was stopped.
- Accepted shared calendars route into the native calendar with separate
  actor/owner/calendar scope, server-confirmed actions and no owner-queue/cache
  contamination. Account switches filter old shared data during render, revoked
  access is removed, and interrupted connections retain an explicitly read-only
  stale view with foreground catch-up.
- Checked shared mutations require the additive migration and review in
  `supabase/mobile-shared-calendar*`. Independent local embedded PostgreSQL tests
  executed the actual SQL: **12/12 passed**, including permissions/RLS, exact
  originals, atomic changes, Undo, legacy boundaries and malformed payloads.
  This is not production deployment or real two-account/JWT acceptance.
- The isolated `codex/mobile-settings-sharing-release` snapshot passed **618**
  fast tests; installed Expo dependency checks passed using its offline map.
  Fresh web, iOS and Android production exports succeeded. Unrelated website
  edits and their extra tests are excluded.
- Live native sign-in/sync/offline recovery is awaiting the human's sign-in in
  the actual Expo app, separately from Safari/website sign-in. Shared-editing
  deployment is awaiting specific human approval for Supabase admin access;
  automatic approval review blocked opening that destination, and no workaround
  or retry was used. Until verified deployment, missing-RPC access stays read-only.

## Production shared-editing migration (November 3, 2026)

- The human explicitly approved opening Supabase and applying the reviewed
  migration, then supplied an authenticated Chrome project tab. The exact SQL
  source hash remained `35c929503d9afde18a891f50808a1bf6ed5a44bd2ec285f674f58c0d897ce893`.
- The SQL editor contents were verified against that hash before execution.
  Supabase reported a successful transaction. Six separate catalog checks passed:
  checked RPC present, authenticated execution allowed, anonymous execution denied,
  both relevant tables still enforce RLS, and all three validation helpers remain
  private. No schedule or membership records were changed.
- The migration deployment gate is cleared. Signed-in native acceptance and
  notification delivery still require actual device results before being recorded
  as passed. New website-to-mobile parity work remains separate from the frozen
  `f3c1752` application runtime used for this release's tests.

## Signed-in native acceptance (November 3, 2026)

- Tested the frozen `f3c1752` application runtime in Expo Go SDK 58 on the actual
  iPhone 16 Pro / iOS 26.5 simulator, served from the isolated release worktree
  on port 8099. The human signed in directly in the native app; no credentials
  or authentication storage were read by the test automation.
- Created one disposable timed activity on November 3, with a child, location,
  responsible adult and packing item. Native reported Up to date, and the
  signed-in production website displayed the same activity and all those details.
  A website title edit appeared automatically in the native calendar, preserving
  the remaining fields.
- Agenda, Week and Month displayed the activity. Home showed the corresponding
  Today/seven-day counts and Next up entry. Native detail view, matching and
  empty searches, child filtering, next-day navigation and Today passed. Family
  displayed the current account as Owner; no invitations or access changes were
  made.
- Changed appearance from Device default to Dark. A native reload retained the
  signed-in session, activity and Dark selection. Restored Device default + Sage.
- With the human's explicit permission, briefly disabled the Mac's Wi-Fi and
  saved a title edit. The native calendar displayed the edited activity, Saved
  on this phone, and one change waiting to sync. An Expo Go reload during the
  interruption returned to the simulator home screen. After restoring Wi-Fi and
  reopening the exact release from Expo Go recents, the app retained the edit,
  automatically uploaded it and returned to Up to date. The website displayed
  the offline-edited title. This verifies durable queued-edit recovery across
  reopening/reconnection, not a successful offline Expo Go cold launch.
- Deleted only the disposable test activity in the native app, then verified
  zero activities on that day in both the native calendar and the reloaded
  website. Native returned to Up to date. Existing calendars, child records and
  unrelated plans were preserved, and Wi-Fi was restored to its original network.
- Runtime/SQL source was unchanged after the isolated 618-test suite, 12 actual
  PostgreSQL migration tests and successful iOS/Android production exports.
  Two-account invitation/pickup/shared-edit acceptance, notification permission
  and delivery, physical devices and store distribution remain unverified.

## Connected entry and feature access (November 3, 2026; new local candidate)

- This follow-up is separate from the published `5ef7c91` release and its actual
  signed-in device evidence above. New navigation and website-parity additions
  must be tested as one explicit snapshot before publishing.
- Welcome's primary Get started opens the five optional questions. Each answer
  can be edited in review; saving opens Create your account, with Sign in at the
  bottom and Preview the calendar first. Welcome retains a direct preview route.
- Real app-shell handler tests use the real preference/preview stores with fake
  auth/network boundaries. They verify guest setup and preview resumption,
  reviewed-answer adoption after sign-in, explicit import opening its separate
  real calendar, retained-draft access isolation, Home returning to owned context
  after shared-calendar selection, and Calendar Share opening Family.
- Real RN Web UI checks at 390px and 320px covered question progression,
  explanation toggle, per-answer edit/save, reviewed answers surviving reload,
  primary signup and secondary sign-in, signup-to-preview, a local plan saved
  using the selected evening hours, preview resumption, and Chinese routes.
  Document width equaled 320px at the small viewport; scrolling reached the
  account/preview choices. No account was created or cloud event written.
- Saved preference review Back now exits directly to its caller. Unfinished
  preview plans remain available as explicitly read-only details after import;
  they are not silently added to a real calendar.
- The initial combined source passed **682/682** repository tests and fresh web, iOS
  and Android production exports. Regression checks include repeat navigation
  to the same Home date after moving elsewhere in Calendar and an account switch
  while an imported preview confirmation is finishing.
- Family now exposes owner comments and an explicit family-profile Web handoff.
  Accepted invitation contexts load on demand without an arbitrary 12-item cap;
  failures stay visible and retryable. Comment response generations prevent late
  results from replacing a new sheet, calendar or account context.
- Actual simulator testing found a sibling-modal transition that visually opened
  planning tools but hid accessibility controls. Calendar tools, planning and
  the new activity editor now share one native Sheet host. Dirty-note protection
  retains the planning form during discard confirmation. The iPhone tester
  verified accessible Open time → Next day → Plan here → seeded Add activity.
- Actual new-candidate simulator acceptance, native share sheets, two-account
  collaboration and notification delivery are separate checks, still pending
  until the testing chat records observed results.

## Final integration follow-up (November 4, 2026)

- The phone Week view uses roomy horizontally scrollable day columns, day
  snapping, aligned headers/non-timed rows and per-day counts. Real WeekGrid and
  agenda-card browser fixtures passed at 390px and 320px in English and Chinese.
  Overlapping titles truncate in the narrow lane; full titles and logistics stay
  available in the selected-day agenda and complete accessible labels.
- Accepted invitation routes open the actual CalendarScreen directly. Comments
  are hosted in its existing Sheet, with selected-calendar identity, authenticated
  account checks, role restrictions, stale-response protection and retained
  unsent drafts. The Family owner-comments shortcut targets that same calendar.
- Phone photos now live under mobile/assets with identical image bytes. The
  isolated candidate preserves the published website's assets and source.
- The final isolated candidate, based on published `5ef7c91`, passed **698/698**
  repository tests and fresh web/iOS/Android production exports. Its 70-file
  runtime import closure matches both the working source and release copy.
  Only mobile and test paths differ from the published baseline; unrelated
  website changes, generated bundles and dependency links are excluded.
- New shared-calendar browser checks used local fake data: Viewer sees the real
  calendar and comments without edit/post controls; Commenter can confirm a
  comment and retain an unsent draft; Editor can save an event and see its title
  updated in that same CalendarScreen. Chinese at 320px had no page overflow or
  console errors. These are UI/controller checks, not live multi-account proof.
- Native tools QA confirmed Home search/pins/packing, the native share sheet,
  repeat date navigation, open-time-to-event creation, comparison, private-note
  persistence/dirty protection and the weekly preview. All disposable native
  event/note/saved-view data was cleaned up; the separate local browser preview
  test event was also removed.
- Expanded Device Hub intermittently hid the accessibility tree after reopening
  native sheets. Compact mode restored grounded touch and successful close/reopen;
  animation and accessibility-flag diagnostics were reverted. No inline-overlay
  rewrite or native dependency patch was retained.
- After the human unlocked the Mac, native Find events passed matching/empty
  search, invalid range validation and opening the matched day. Saved-view apply
  restored its date/view after navigating elsewhere; the temporary view was
  removed. Settings, all five preference questions/review/cancel/direct Back,
  reminders Off without opt-in, Calendar Share → Family People, Inbox/Pickups
  and owner comments in the actual calendar passed.
- An existing accepted Viewer calendar also opened directly in the native
  calendar with actual activities and no add/edit/delete controls. Its comments
  were read-only. No invitation, comment or notification was sent.
- Native QA reproduced a Home target hidden behind old Calendar filters. Valid
  external focus now clears those filters, while ordinary rerenders preserve
  manual browsing. Find results now label all-day events without a stale clock.
- Final date/time integration opens Today at the saved view/hour for ordinary
  entry. Timed Home and reminder targets carry their start; continuation days
  use their segment time, and all-day/invalid clocks fall back to the saved hour.
  Repeated external requests re-center Week. Opening account setup clears an old
  target so new preferences apply on return. Week has a half-hour lead-in above
  its focused time.
- The publisher completed the final changed-case native checks on the exact
  frozen source, as recorded below. Live Editor/Commenter mutation round trips,
  notification delivery and physical-device acceptance remain separate checks.

## Final frozen iPhone acceptance (November 4, 2026)

- The final 70-file runtime manifest has SHA-256
  `c27af2daf3bacc3b59af52e3ab379ef5361b95cb0f7262cd888f57c25ad3072a`.
  Working source, isolated release and native QA copies matched. The native
  project was reloaded after restarting Metro to include the new focus module.
  The real signed-in session survived and the app reported Up to date.
- A stale nonmatching Calendar search and selected child filter were cleared by
  tapping a Home plan. Calendar opened the correct date with Everyone selected
  and the target activity visible. Ordinary in-calendar navigation remains
  covered separately by the focus-effect regressions.
- With an old Home target at November 5 / 05:00, saved Week + Morning preferences
  returned to Today, November 4, in Week view at the saved 06:00 hour. An ordinary
  Home Open calendar action also returned from a future date to Today with those
  saved settings. The prior target did not override the newly saved preferences.
- A timed Home target opened November 5 at 05:00 with the 5 AM label and activity
  visible below the fixed header. The human performed the manual Week swipe
  because the automation bridge could not send gestures; after observing the
  scrolled grid, repeating the Home target restored the 5 AM label and activity
  fully into view. This is native visual/user-assisted evidence, not a claim
  that every gesture or VoiceOver scenario was automated.
- An existing all-day Home plan used the saved 06:00 opening hour rather than its
  retained legacy clock. Find events rendered All day instead of that stale time.
- The website handoff opened the production KidsSync calendar in iPhone Safari.
  Returning through Home -> Expo Go preserved the same signed-in Family People
  screen and Up to date state. No website/provider changes were made.
- Restored all original effective answers: Whole family, Today, Monday, Whole
  day and No reminders. Dark + Ocean appearance and the existing pin/packing
  state were unchanged. Removed the disposable saved view and verified No saved
  views. Deleted only the disposable 05:00 activity, verified zero activities
  on its day, then verified Home's zero seven-day plans and Up to date status.
  Earlier tester-owned QA note/view/activity cleanup was also confirmed.
- No invitations or comments were posted and no OS reminder permission was
  accepted. The existing accepted Viewer was verified against a real account;
  Commenter/Editor writes, invitation/role changes, email-confirmation/recovery,
  physical devices and notification delivery are not newly claimed as live passes.
- All **698** isolated automated tests and fresh iOS, Android and web exports
  passed on this frozen runtime. Only verification documentation changed after
  those checks.
