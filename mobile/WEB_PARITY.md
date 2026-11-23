# Website tools in the phone app

This inventory describes the phone app's website feature coverage. The route
inventory lives in [FEATURE_ACCESS.md](FEATURE_ACCESS.md).

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
| Quick Add | Turns English or Chinese text into a draft for review in the event editor. |
| Document text | Parses copied flyer/email/photo text with the website's parsing rules. Extracted date, time, person, location, adult, items and recurrence open in the normal event editor for review. |
| Find family time | Uses the website's scheduling rules for selected people, notice, travel, buffers and daily limits. |
| Family poll | Compare up to five times, record replies on this device, share options and review an available time. |
| Activity lists | Review upcoming and past calendar occurrences, including recurring events. |
| Activity history | Reads the calendar's saved audit history and shared changes. Shared acknowledgements require the deployed family coordination migration. |
| Versions and presets | Owners can restore a saved version or preset and save a new preset. Restores keep a checkpoint. |
| Calendar files | Review and select individual events, with dates, times, people and locations. Backups preserve existing profile names and add missing profiles atomically with the events. Export iCalendar, JSON and weekly PDF, print, or compose a weekly email. |
| Calendar display | Owned calendar default view, event duration and weekend visibility sync through the same settings fields as the website. |

Open-time suggestions cover only the current calendar and do not reserve a
slot. Review the event before saving; normal owner/shared access checks and
save/conflict handling remain authoritative. Unknown or malformed busy times
block availability conservatively. Stored timezone metadata is not reinterpreted;
the current native calendar uses floating local wall-clock times.

Day notes and saved views are device-local, keyed separately by signed-in user,
calendar owner and calendar ID. They are not synchronized with website private
notes or included in the Supabase snapshot. Corrupt storage is reported rather
than silently erased. Simultaneous local writes are serialized. Saved views
include category and weekend filters. Legacy views receive their prior defaults.

## Native Home shortcuts

Home greets the family, shows upcoming holidays and plans, and displays recent
calendar activity when available. Search covers 90 days. Pins, packing progress
and family polls are device-local. The native event editor supports templates,
one-off duplication, colors, attendees, event types, status, icons and buffers
using the web event fields. Week and 4 days show a GMT offset and a scrollable
24-hour timeline. Tapping an hour starts a draft with the selected date and time.
Family profiles are editable under Family → People. Removing a profile keeps
its events and reassigns them to the family.

## Explicit website handoffs

Photo OCR, Google/Outlook connections and Google Calendar account import use
the website. Native document text parsing and file import work independently.
Browser sign-in and provider configuration may be required for account tools.
Phone reminders use the device's local notifications. Remote push and automatic
email delivery need a separate backend integration.

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

Planning suggestions create new drafts. Native print, document picking, real
notification delivery and live two-account behavior still require phone testing.

The November 23 consistency pass checks native document review through saved
event details, shared display settings, overnight default durations, restoring a
holidays-only view, and English/Chinese layouts at 390/320px in an isolated
fictional-data preview. It also checks backup profile IDs and exception time zones.
