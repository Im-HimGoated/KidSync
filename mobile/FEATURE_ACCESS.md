# Phone feature access

This is the navigation inventory for the connected mobile candidate. The
website remains available separately. Device acceptance results belong in QA.md;
an entry in this inventory describes its route, not a claim that every external
provider or multi-account action has passed a live test.

## First visit and returning users

| Starting point | Destination |
| --- | --- |
| Welcome → Get started | Five optional questions; small Why these questions? explanation; saved progress |
| Questions → Review my choices | All five answers, each with Edit and Save answer |
| Review → Save & continue | Create your account first, Sign in at the bottom, or Preview the calendar first |
| Welcome → Try the calendar without an account | Blank ten-minute device-only preview; setup can be revisited later |
| Preview → Make your calendar yours | Name, calendar name, description, icon, setup preferences, signup or sign-in |
| Signup requiring email confirmation | Confirmation instructions; return to the app and Sign in |
| Signed-in preview notice → Save preview to my account | Explicitly create and open a separate real calendar; existing calendars are preserved |
| Signed-in preview notice → Review unfinished preview plan | Read-only retained draft details; finish an existing activity with Edit, or a new plan with Add |

Signing in alone does not upload guest plans. Setup answers are saved for the
account on this device. The guest preview is a day agenda; the full calendar
views and collaboration tools are available after authentication.

## Daily navigation

| Area | Access and features |
| --- | --- |
| Home bottom tab | Greeting, upcoming plans and holidays, recent calendar changes, handoff needs and family rhythm |
| Home → Quick planning tools | Upcoming search, pins, tomorrow, today's share preview, packing checklists |
| Home plan or date | Opens that owned calendar/date; timed plans focus their start in Week, and repeat taps re-center the timeline |
| Calendar bottom tab | Agenda, Day, Week, 4 days and Month with date navigation, search, person and category filters |
| Calendar selector | Switch calendars or create, rename or delete an owned calendar |
| Calendar → + / activity card | Add, inspect, edit, duplicate or delete. Event options include type, color, icon, attendees, status, travel, buffers and recurrence |
| Recurring activity actions | Choose a single occurrence or the whole series; supported confirmed operations offer Undo |
| Week view | Scrollable 24-hour grid, tap an hour to add, GMT offset, optional weekend columns and a holiday band |
| Calendar → sliders → Plan & review | Quick Add, family poll, find family time, open time, compare days, private day notes and review/share a week |
| Calendar → sliders → Find & customize | Event finder, upcoming/past activities, saved views and setup preferences |
| Calendar → sliders → History & files | Activity history and acknowledgements, owner version restore and presets, phone calendar-file import/export, weekly PDF, printing and email draft |
| Calendar → Share | Family → People for that owned calendar |
| Family bottom tab → People | Access management, owner comments in the real calendar and family profiles |
| Family → Inbox | Invitations, direct access to accepted shared calendars and incoming pickup requests |
| Calendar → Comments | Comments for the selected real calendar; posting follows owner/commenter/editor permissions |
| Family → Pickups | Assign and review occurrence-based pickup coordination |
| Avatar → Account & settings | Original setup answers, appearance, phone reminders, language, help, web calendar and confirmed sign-out |

Shared Viewer/Commenter calendars remain read-only. Editor changes require
verified checked-write support. Source-managed events remain read-only. Owner
offline changes show their local/queued/conflict state and reconnect through the
same sync controller.

## Settings and website handoffs

Calendar preferences reopens the saved answer review. Edit returns to that review;
Back returns directly to the calling workspace. Appearance offers device default,
light/dark and four accent palettes. Phone reminders are opt-in and apply to
confirmed calendars the user owns; shared recipient calendars are excluded.

Scan document, connected Google or Outlook calendars and Google import use the
browser. Once the matching website change is deployed, those links open the
requested tool after website sign-in. Provider configuration may be required.
The weekly email action opens a draft in the phone's email app.

Day notes, saved views, polls, pins, packing progress, appearance and setup preferences
are device-local with account/calendar scope where applicable. Calendar activity
data uses the existing account sync. Private day notes are excluded from shared
agendas. Activity acknowledgements and edits by other accounts require the
existing Supabase family coordination migration.
