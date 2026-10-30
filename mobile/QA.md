# Phone release verification

## Release evidence and remaining acceptance

Xcode and an iPhone simulator are now installed. Welcome/sign-in navigation and
the guest trial's draft recovery, early event creation/edit/deletion and expiry
handoff have been exercised on iPhone Duo / iOS 27.1. Signed-in native calendar,
live offline recovery, two-account sharing and cross-device sync acceptance are
still pending. This is a development release, not completed store-distribution
or physical-device validation. Browser viewports and bundle exports are recorded
separately from actual iPhone simulator checks below.

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
