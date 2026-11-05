# Website tools in the phone app

This inventory covers the native parity slice added after the frozen
`f3c1752` release candidate. It does not claim that every website workflow has
been rewritten natively or that live account/device acceptance has passed.

## Native calendar tools

Open Calendar and select the sliders icon to open Calendar tools.

| Website tool | Phone implementation |
| --- | --- |
| Find open time | Date/window/duration search across the selected calendar; includes travel and buffers, neighboring-day spillover, all-day blockers and recurrence exceptions. Selecting a slot opens an unsaved new activity. |
| Compare days | Two dates with event counts and merged timed occupied minutes, excluding cancelled events. |
| Private day notes | Explicit save, unsaved-change protection, storage failure feedback and retry; 2,000 characters per note and 730 dates. |
| Weekly agenda | Seven-day preview respecting week start, optional event notes/items, then the native share sheet. Private day notes are always excluded. |
| Saved views | Up to eight named date/view/search/person-filter presets; open or remove without modifying events. |
| Event finder | Bounded date range of up to 366 days, recurring occurrences, text/person/location/notes search and paged results. Opens the selected day with calendar filters cleared. |
| Calendar preferences | Existing native preference review remains accessible through the toolbox. |

Open-time suggestions cover only the current calendar and do not reserve a
slot. Review the event before saving; normal owner/shared access checks and
save/conflict handling remain authoritative. Unknown or malformed busy times
block availability conservatively. Stored timezone metadata is not reinterpreted;
the current native calendar uses floating local wall-clock times.

Day notes and saved views are device-local, keyed separately by signed-in user,
calendar owner and calendar ID. They are not synchronized with website private
notes or included in the Supabase snapshot. Corrupt storage is reported rather
than silently erased. Simultaneous local writes are serialized.

## Native Home shortcuts

Home adds upcoming-plan search over 90 days, pinned next occurrences, tomorrow's
preview, today's agenda sharing, and packing checklists/progress. Pins and packing
progress are also device-local and account/owner/calendar scoped. The app shell
passes the authenticated user ID; missing scope disables personal mutations.

## Explicit website handoffs

Scan document, Google/Outlook connections, Google Calendar import, activity
history, calendar version history, file export and printing are marked **Web**.
Choosing them opens the existing KidsSync website; the user then selects that
tool there. There is no invented native OAuth, scanning, history or file-export
implementation. Browser sign-in and provider configuration may be required.
An unavailable native callback is not advertised as a working native feature.

## Validation and remaining work

Planning models reuse the website's pure planning engine rather than duplicating
its gap/search/agenda rules. Tests cover overnight segments, adjacent-day buffers,
recurrence exceptions, overlapping-time totals, storage isolation/corruption,
limits, and private-note exclusion from shared agendas.

RN Web fixture checks at 320px verified toolbox navigation, open-time results,
notes saving and reload recovery, dirty-note confirmation, named-view saving,
weekly preview, and Chinese dark-mode comparison. These checks use fictional data,
not real authentication or cloud writes. The native share sheet and actual phone
keyboard behavior still require device acceptance.

The follow-up route audit also checks toolbox dispatch, new-draft identity,
shared permission guards and account/owner/calendar storage isolation. Incomplete
dates now disable note entry and day arrows and show date validation, so an
unsavable note cannot trap the user in a dirty draft. Closing a planning sheet
returns to the calendar; opening a found day clears filters, while opening a
saved view restores its saved filters.

The new-activity editor accepts only date/time fields from a planning suggestion;
it remains a new activity with no original event or inherited ID. Event templates,
duplicate-event controls and richer icon-picker parity are separate follow-up
work, not completed by this slice. Do not include unverified parity changes in a
previously frozen release merely because they share the local working directory.
