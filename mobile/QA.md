# Phone release verification

## Required final gate

iPhone simulator testing is required before pushing this release. At preparation
time this Mac has `/Library/Developer/CommandLineTools` selected and `simctl` is
unavailable. The user is installing Xcode and will confirm when first-launch
setup and an iOS runtime are ready. Do not label a browser viewport or bundle
export as a completed iPhone simulator check.

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
8. Verify tablet and desktop exclusion independently. Narrowing a desktop window
   must not unlock the app. Only an explicit development preview opt-in may do so.
9. Run the full suite, native exports and isolated Git diff checks against the
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
