# Native calendar improvements — October 30, 2026

This pass is local code. No commit, push, account creation, live calendar write,
schema change or RLS change was performed from this chat.

## Implemented

- Agenda/Week/Month navigation, explicit all-date search scope, clear-filter
  recovery, selected-day reveal on narrow grids, and synchronized draggable
  Week headers/all-day rows.
- An unsaved editor stays mounted while Keep editing / Discard changes is
  presented. Saved hour/reminder preferences initialize new events; existing
  clocks and unknown metadata remain intact. Invalid fields scroll into view.
- Trial Add/Edit protects an unfinished draft before replacing it, resumes the
  same event draft, guards duplicate/open/save actions, and blocks dismissal or
  all-day changes during a save. One native modal contains both the draft decision
  and editor, so switching between them does not require overlapping modals.
- Recurring Edit/Delete explicitly chooses one occurrence or the entire series.
  Overlapping spans require selecting the actual start. One-occurrence edits use
  canonical `excludedDates` plus a detached nonrepeating event in one write.
- Deletion Undo restores only affected records against a fresh row, preserves
  unrelated changes and raw compatibility-mirror metadata, and rejects changed
  or reused IDs. Undo is available in the current calendar session; it is not a
  durable recycle bin.
- Multi-day/overnight events use each day's correct clock bounds, including
  midnight endings. Date-only values and recurrence anchors remain local across
  DST. Unknown timezone metadata is retained; timezone conversion was not added.
- Sign-in, signup, personalization and preference review have improved keyboard,
  validation, accessibility and error handling with English/Chinese parity.

## Integration contract

`CalendarScreen` now accepts optional `activityActions`, forwarded to
`model.createCalendarActions`. The default uses `shared/backend/mobile-calendar`.
An injected adapter may bind the durable queue's short signatures:

```js
save(calendarId, event, original) // resolves only after durable local save
remove(calendarId, eventId, original)
```

Rows with `pending: true` retain that marker through `onSchedule` and display
“Saved on this phone. Waiting to sync.” Pending deletions explicitly clear Undo,
even if a projected row carries an older server token. Storage, queue-capacity
and blocked-sync errors keep the draft open. The parent must not pass a pending
row to `acceptConfirmed`.

The backend-compatible signatures remain available for injected overrides:

```js
saveActivity(client, userId, calendarId, event, { original })
deleteActivity(client, userId, calendarId, eventId, { original })
createCalendar(client, userId, { name })
mutateActivities(client, userId, calendarId, [{ original, event }])
restoreActivities(client, userId, calendarId, undoToken)
```

`mutateActivities` commits related records in one authenticated fresh-read/CAS
operation. `deleteActivity` and `mutateActivities` return the confirmed row plus
`undoToken`; `restoreActivities` returns a confirmed row. Tokens are owner/calendar
scoped. A null event means deletion; a null original means insertion. All raw
originals and ID uniqueness are checked before any write. Exclusion-only changes
can retain legacy undated/untimed series without silently reanchoring them.

The controller exposes `saveOccurrence(calendarId, original, startDate, event)`,
`removeOccurrence(calendarId, original, startDate)` and
`restore(calendarId, undoToken)`. Account/calendar scope guards remain active.

Atomic occurrence changes and Undo remain online backend operations when the
adapter supplies only `save`/`remove`; they are never split into independently
queued saves. Fresh raw-original checks prevent replacing a series changed by
pending edits. Offline integration belongs to the release integrator, including
merging confirmed rows with projected pending changes. The release integrator
also aligned the queue validator: a valid later `endDate` permits an overnight
end clock, while a same-day reversed interval remains invalid.

## Verification performed

- Latest full repository test run: **560 passed**, zero failures (concurrent mobile and
  web work was present). New tests include 17 atomic/undo tests, eight occurrence
  tests, four editor-safety tests and four trial-draft tests.
- Final handoff subset: 35 atomic/occurrence/editor/trial/queue-adapter tests and
  ten bilingual static renders passed after the pending-Undo safeguard.
- Native calendar/backend subset: 77 passed before the final falsy-patch
  regression was added; all are included in the full passing run.
- Calendar static rendering passed in English/Chinese for all three views and
  editor/details; occurrence editor/details received four additional checks.
- 33 mobile/backend JavaScript modules parsed; tracked mobile whitespace checks
  passed. Full iOS and Android Expo exports succeeded at
  `/private/tmp/kidssync-mobile-improvements-final-export`.
- **Actual iPhone Duo / iOS 27.1, Expo Go:** trial entry, missing-title validation,
  draft close/protection/resume with retained title and 01:30–02:30 times, save,
  edit, delete confirmation and removal passed. Trial expiry opened
  personalization and retained an unfinished draft. No live account was used.
- **Disposable browser fixture, 390px and 320px:** search recovery, dirty-close
  confirmation/Keep editing/save, one-occurrence edit retaining the later repeat,
  one-occurrence delete/Undo, Saturday Week selection, Chinese Month and all-day
  trial creation passed. The 320px document did not overflow horizontally.

Fixture/browser checks do not complete signed-in native-device or live-account
acceptance. Home/settings/sync integration and final release QA remain with
their owning chats. Existing timestamp CAS still cannot detect an external writer
reusing the identical stored timestamp; Undo cannot detect a create/delete cycle
that leaves the same ID absent without server-side revisions or tombstones.
