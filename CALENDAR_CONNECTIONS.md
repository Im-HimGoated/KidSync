# Connected calendar setup

KidsSync can show read-only events from a user's primary Google Calendar or default Outlook calendar. OAuth tokens and imported events stay in browser memory and are cleared when the page reloads.

## Google Calendar

1. Create an OAuth 2.0 client for a web application in Google Cloud Console.
2. Enable the Google Calendar API.
3. Add every deployed site origin and local development origin to **Authorized JavaScript origins**. For example, use `https://your-site.example` and `http://localhost:8001` without a trailing path.
4. Add the public client ID to `window.KIDSSYNC_CALENDAR_CONNECTIONS.googleClientId` in `supabase-config.js`.

KidsSync requests only the `calendar.readonly` scope. Do not add a client secret to this repository.

## Outlook Calendar

1. Register a single-page application in Microsoft Entra ID.
2. Add `<site-origin>/oauth-redirect.html` as a SPA redirect URI. For local testing, add the matching localhost URL too.
3. Add the delegated `Calendars.Read` Microsoft Graph permission.
4. Add the public application client ID to `window.KIDSSYNC_CALENDAR_CONNECTIONS.microsoftClientId` in `supabase-config.js`.

The implementation uses the `common` authority so personal Microsoft accounts and supported work or school accounts can sign in. Do not add a client secret.

## Verify

Serve KidsSync over HTTP or HTTPS, open **More > Connected calendars**, and connect one provider. Confirm that events appear as read-only and that reloading the page clears the connection.

External events are displayed in the normal calendar with a read-only details sheet. They are not copied into the family schedule or uploaded to Supabase. Only the loaded date range is available; refresh after navigating outside that range. Refresh is manual, not a background two-way sync. Disconnecting removes this device's session data. Microsoft permissions can also be revoked in the account's app permissions page.

The Microsoft integration vendors `@azure/msal-browser` 5.25.0 and its redirect bridge from the official npm package in `assets/vendor/`. Its MIT license is included there. Do not cache `oauth-redirect.html` or serve it with Cross-Origin-Opener-Policy headers. The Vercel configuration sets `Cache-Control: no-store`; other hosting platforms must provide the same header. No client secret or service-role key belongs in browser code.

## Shared pickups and change acknowledgements

1. Apply the existing `supabase/schema.sql` first if the project has not been configured.
2. Run the additive `supabase/family-coordination.sql` in the project's Supabase SQL editor. It creates tables, RLS policies, narrowly authorized RPCs, and a schedule-change trigger. Re-running it is supported.
3. Sign in as an owner, invite a second real account, and accept that invitation.
4. Save an event, open **More > Family coordination > Pickups**, and enter the accepted member's account email. Assignment does not imply acceptance.
5. The recipient opens the shared calendar from their invitation/mailbox and chooses **Family coordination**. Only that signed-in recipient can accept or decline the request.
6. Move or edit the event: an accepted pickup returns to awaiting confirmation. Deleting the event cancels its pickup request. Changes recorded after migration appear in the Changes tab; each member acknowledges only as themselves.

Guest mode shows comparison and device history but cannot impersonate shared acknowledgements. The migration has local PostgreSQL-compatible RLS tests in `tests/coordination-db.mjs`; it has not been automatically applied to your remote Supabase project.
