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
| Home bottom tab | Today and seven-day counts, next plans, handoff needs, family rhythm, calendar selection |
| Home → Quick planning tools | Upcoming search, pins, tomorrow, today's share preview, packing checklists |
| Home plan or date | Opens that owned calendar/date; timed plans focus their start in Week, and repeat taps re-center the timeline |
| Calendar bottom tab | Opens Today using the saved view/hour; Agenda, Week, Month, date navigation, search and person filters remain available |
| Calendar selector | Switch calendars or create an owned calendar |
| Calendar → + / activity card | Add, inspect, edit or delete; time/all-day, person, location, pickup, packing, notes, importance, reminders, recurrence |
| Recurring activity actions | Choose a single occurrence or the whole series; supported confirmed operations offer Undo |
| Week view | Roomy day columns with synchronized horizontal day snapping, a 24-hour grid, holidays/all-day band, activity counts and the selected-day agenda |
| Calendar → sliders → Plan & review | Open time, compare days, private day notes, review/share a week |
| Calendar → sliders → Find & customize | Event finder, saved views and original setup-answer review |
| Calendar → Share | Family → People for that owned calendar |
| Family bottom tab → People | Access management, owner comments in the real calendar, family-profile website handoff |
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

Tools marked Web open KidsSync in the browser: scan document, connected Google or
Outlook calendars, Google import, activity history, version history, file export
and printing. Family's Manage family profiles (Web) explains where to add or
rename children. These handoffs open the website; the user chooses the named tool
there and may need to sign in or configure its provider.

Day notes, saved views, pins, packing progress, appearance and setup preferences
are device-local with account/calendar scope where applicable. Calendar activity
data uses the existing account sync. Private day notes are excluded from shared
agendas. Event templates, duplicate-event controls and richer icon parity are
separate work and are not advertised as completed native tools.
