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

## Live iPhone sign-in acceptance (November 12, 2026)

- iPhone 16 Pro simulator, iOS 26.5, Expo Go. The tester signed into the
  production KidsSync account in the native app. Home opened, and **Open
  calendar** loaded the account’s calendar in its saved Agenda view.
- Account → Calendar preferences showed all five setup answers. Choosing Week
  and cancelling the edit returned to the review with Agenda still selected.
  The simulator was left on signed-in Home.
- The landing page, all five questions, editing and saving an answer, the
  account creation handoff, and password-reset navigation were checked earlier
  on the same simulator. The 721 automated tests passed on release `69b0c20`.

## Mobile UI acceptance (November 12, 2026)

| Environment | Verified |
| --- | --- |
| Repository suite and local PostgreSQL | 727 application tests and 12 shared-calendar SQL tests passed. The automated checks cover trial expiry and retention, event recurrence and Undo, offline queues and conflicts, reminder lifecycle, and sharing permissions. |
| Production bundle exports | Web, iOS, and Android exports passed for the current workspace changes. |
| iPhone 16 Pro simulator, iOS 26.5, Expo Go | The published build restored an existing session and showed Home and You & settings. After sign-out, Welcome, all five setup questions, review and edit, account creation entry, sign-in navigation, and password reset entry and return worked. Fresh live sign-in and saved preferences were verified as described above. |
| Phone-width preview, 320 and 390 px | Welcome disclosures, EN/ZH layout and language persistence, appearance save/reload/reset, sign-in and signup validation, guest draft recovery after reload, creation at 01:15, conversion to all-day, and confirmed guest deletion passed. The event appeared in Agenda, Day, Week, and Month. Personalization kept the plan and applied the saved Week preference. |
| Phone-width preview with local test data | Sign-in, signup confirmation, password-reset feedback, and sign-out cancel/confirm passed against a fake backend. Explicit guest import added a separate calendar and preserved the original. Home search, pinning, packing, and the timed Calendar link passed. Calendar search and person filter, date jump, Today, create/edit/delete, unsaved-change protection, and planning tools were exercised. |
| Family and Settings with local test data | Calendar Share opened Family. People, Inbox, and Pickups rendered. A local Editor invitation was created. Viewer could read events and comments, Commenter could post, and Editor could save a change. Help expanded, Chinese Settings fit at 320 px, and browser reminder settings correctly showed native-only availability. |

Production signup and recovery email delivery, a live
two-account invitation/pickup/shared-edit round trip, OS notification delivery,
and physical iPhone and Android checks are still open. No live invitations,
comments, schedule writes, or notifications were sent in this pass.

## Signed-in Day and Week acceptance (November 21, 2026)

- Used Xcode UI automation against the existing Expo Go session on **iPhone 16
  Pro / iOS 26.5**, explicitly targeting simulator
  `9981DAB2-482C-4EDD-A152-19A6CD6B95AF`. No iPhone 17 Pro was selected.
- Restored native control independently of the Device Hub window bridge. The
  weekly-preview sheet covered Home and exposed a second Open calendar button;
  choosing the hittable control opened the account's actual calendar. No user
  reopen or sign-in handoff was needed.
- Visually inspected native screenshots of Day and Week at Today, after vertical
  scrolling from morning to afternoon, and after next-day/next-week navigation.
  Hourly lines remained visible across Day's full width and across highlighted
  and unselected Week columns. Time labels stayed aligned; the current-time line
  appeared on Today and disappeared on the future day/week.
- Today restored the actual date/current-time focus after navigation and
  scrolling. The simulator was left on signed-in Day at Today. The native
  navigation/selected-view test passed with zero failures; seven screenshots
  were separately inspected for visual acceptance.
- Added `scripts/check-ios-calendar.sh` and the small Xcode UI test project for
  reproducible control pinned to the booted iPhone 16 Pro. Results and account
  screenshots are kept outside Git. No account records, invitations, comments
  or notification settings were changed. This completes the native hourly-line
  visual check for the fix already published in `a21b857`; the other release
  acceptance gaps listed above remain separate.

## Live calendar display sync acceptance (November 23, 2026)

- Tested the authenticated KidsSync app in Expo Go on the **iPhone 16 Pro
  simulator, iOS 26.5**, against the same calendar on the production website.
  The test used the existing Supabase project and actual account data.
- Saved **4 days**, **45 minutes**, and **weekends hidden** in the phone app.
  Reloading the website showed the same calendar settings. The native calendar
  opened in 4 days, and a new unsaved activity draft had a 45-minute duration.
- Restored **Week**, **30 minutes**, and **weekends shown** on the website.
  The phone's Calendar display panel received those original values. The test
  left the account's original settings restored and created no activity from
  the duration-check draft.
- Xcode results `settings-applied-final.xcresult` and
  `settings-restored-final.xcresult` each passed with zero failures on simulator
  `9981DAB2-482C-4EDD-A152-19A6CD6B95AF`. Screenshots and account-specific test
  results remain outside Git under the local integration evidence folders.
- This completes the live round trip for opening view, new-event duration and
  weekend visibility. Physical-phone delivery of notifications, external
  provider connections and live collaboration role changes retain their
  separate acceptance requirements.

## Native document and event sync acceptance (November 23, 2026)

- On the same authenticated iPhone 16 Pro simulator, imported a disposable
  document draft, reviewed it in the native editor, saved it and reopened its
  details. The responsible adult, all three packing items and source notes
  survived. A fresh production website reload independently showed those fields.
- Edited the test activity to **High** importance and **weekly on Saturday**.
  Native details and the website's event editor agreed, while the responsible
  adult and packing items remained intact.
- Deleted the entire test series in the app. The native result passed, and a
  fresh website reload showed zero test-event buttons while an existing
  Thanksgiving event remained visible. No disposable document event remains.
- Xcode runs `document-live3`, `doc-edit` and `doc-cleanup` each passed one test
  with zero failures. Account screenshots and test artifacts remain outside Git.
  This verifies the saved details; it does not claim native photo OCR or physical
  phone notification delivery.

## Combined release validation (November 23, 2026)

- The final source passed **872/872** repository tests with zero failures,
  skips or cancellations, and fresh Expo exports for iOS, Android and web.
  `git diff --check` passed. Test logs and compiled bundles remain outside Git.
- Regression coverage includes profile name/numeric-ID/string-ID reassignment,
  unchanged calendars and compatibility mirrors, invalid pickup occurrences,
  fresh pickup response checks, quiet foreground refresh, unsaved profile
  protection and calendar-scoped profile saves.
- Actual iPhone simulator input confirmed that Keep editing retained an unsaved
  profile name and Discard restored the original after reopening. No profile
  save ran. A follow-up Close/Inbox/Pickups/Calendar navigation test passed.
  The runner's reopened-modal Close hit test needed an observed-point fallback;
  a direct touch on the visible X worked without a product change.
- The native Holidays-only saved-view round trip passed. Reopening restored
  its selected filters, and the disposable saved view was removed afterward.
- Native Account checks passed for Light/Dark appearance, Chinese/English
  labels, reminder-status display and the calendar setup review/Why we ask
  flow. Dark and English were restored, setup edits were cancelled, and no
  notification permission or delivery preference was changed.
- Native iCalendar sharing displayed the actual OS sheet with the exported
  file and Copy/Save to Files actions. Cancelling re-enabled the Calendar files
  controls and allowed return to Day. The rebuilt cancellation test executed
  one test with zero failures; no external share target was selected.
- The native Calendar display unsaved-exit test passed: Back/Keep editing
  retained a changed duration draft, and Close/Discard returned without saving.
- The exact release source passed the final native Day/Week test. Inspected
  captures retained hourly lines, today's highlight and the current-time line;
  vertical scrolling, next day/week and Today navigation worked.
- An ordinary Expo Go cold reopen preserved the existing signed-in session.
  The same Day/Week navigation and scrolling check passed again; the simulator
  was left on Day/Today with the original account preferences restored.
- A separate phone-size runtime check verified a cross-date 4-day Next event
  jump reaches the 5 PM plan and keeps that hour after rerendering. The functional
  regression also verifies content-size changes do not reset it to 8 AM and
  ordinary date navigation retains its normal opening hour.
- Live two-account sharing/pickup acceptance still needs a distinct recipient
  account. The subsequently approved disposable calendar/profile lifecycle is
  recorded below. Physical-phone notification delivery remains separate; neither
  distinct-account collaboration nor physical delivery is represented as passed.

## Approved calendar/profile lifecycle sync (November 23–24, 2026)

- Created only the approved Mobile QA Nov 23 calendar, test child and event on
  the authenticated iPhone 16 Pro simulator. The production website independently
  received the calendar, child and assigned event.
- Website title/location edits appeared on the iPhone. Native and website child
  renames each appeared on the other client with event links intact. These native
  round-trip and website-rename receipt tests each executed one test with zero
  failures.
- Removed the last test child through the repaired production website editor.
  The event remained assigned to Family with its edited title and location on
  both clients; native details and the event label independently confirmed this.
- Deleted the exact test event and captured temporary calendar through normal
  website controls. Cloud save and a fresh reload confirmed the event was absent
  and only the original Family calendar remained selected.
- Reopened the same signed-in iPhone 16 Pro after restarting its stopped local
  Expo server. Home received the test event's deletion in history; the calendar
  showed zero activities on November 23, and Your calendars contained only Family,
  selected. English and Dark remained intact. No test calendar, child or event
  remains. The existing Family records were not edited.
- Native cleanup was verified through actual Device Hub controls and screenshots.
  Earlier cleanup runner attempts failed on navigation/confirmation selectors;
  they are not recorded as passing deletion tests. The final website deletion
  and native readback above are the actual cleanup evidence.
- Fixed profile-removal data loss, last-child removal parity, profile reference
  preservation and native event metadata loss during website edits. Regression
  coverage also protects numeric event ID zero from becoming a duplicate.
- Final source passed 901/901 repository tests with zero failures, skips or
  cancellations. iOS, Android and web exports passed. Local evidence remains
  outside Git: `kidssync-approved-lifecycle-final-tests.log`,
  `kidssync-profile-fix-export-20261123`,
  `kidssync-lifecycle-cleanup-20261124.jpg` and
  `kidssync-lifecycle-native-cleanup-20261124.png` under `/private/tmp`; earlier
  native round-trip results are under `/tmp/kidssync-integration-native`.
- No invitation, message, OS permission or notification setting was changed.
  Distinct-account collaboration and physical-phone notification delivery are
  not claimed by this acceptance.
