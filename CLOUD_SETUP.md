# KidsSync cloud accounts

KidsSync uses Supabase Auth and row-level-secured data for schedules, recipient-specific sharing links, invitation notes, and calendar comments. Guest mode continues to work without this setup, but cross-device accounts and sharing require it.

1. Create a Supabase project at https://supabase.com/dashboard.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it.
3. Open **Project Settings > API** and copy the Project URL and publishable key.
4. Put those two public values in `supabase-config.js`:

   ```js
   window.KIDSSYNC_SUPABASE = {
     url: "https://YOUR_PROJECT.supabase.co",
     publishableKey: "sb_publishable_YOUR_KEY"
   };
   ```

5. In **Authentication > URL Configuration**, set the Site URL to the deployed KidsSync URL. Add local and preview URLs as redirect URLs while testing.
6. Redeploy the site. Create an account in KidsSync, then sign in with the same email and password on another device.

The sharing rules are enforced in the database:

- **Viewer** can open the shared calendar and, after signing in and accepting, read comments.
- **Commenter** can read the calendar and add comments, but cannot change events.
- **Editor** can add, edit, and delete events and can also comment.
- Anyone with an invitation link can immediately see a sanitized, read-only event preview. The preview excludes emails, comments, invitation notes, account settings, event notes, and unshared calendars.
- Commenting and editing remain bound to the invited email address, an accepted invitation, and the assigned account role.
- The public preview RPC uses `SECURITY INVOKER`, column-level grants, and token-scoped RLS. It does not bypass row-level security.

The publishable key is designed for browser use. Never add a `service_role` or secret key to this repository. Access to `family_schedules` is protected by the row-level security policies in `supabase/schema.sql`.

## Security Advisor notes

After running `supabase/schema.sql`, rerun the Supabase Security Advisor. Owner-managed member updates use `SECURITY INVOKER`, restricted column grants, and RLS, so they should not appear under **Signed-In Users Can Execute SECURITY DEFINER Function**.

Two reviewed functions intentionally remain `SECURITY DEFINER` because they perform narrowly scoped cross-owner operations:

- `respond_calendar_invitation` binds an invitation to the signed-in recipient after checking the user ID, JWT email, requested status, and invitation row.
- `update_shared_calendar_activities` updates only one shared calendar's activities after checking the signed-in user is its active editor.

Both functions use an empty `search_path`, fully qualified table names, explicit input validation, and execution grants limited to `authenticated`. Removing that grant will break invitation acceptance or editor access; moving those operations to a server-side Edge Function is the larger alternative if a zero-finding Advisor report is required.
