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

- **Viewer** can open the shared calendar and read comments.
- **Commenter** can read the calendar and add comments, but cannot change events.
- **Editor** can add, edit, and delete events and can also comment.
- Invitation links are bound to the invited email address, so forwarding a link does not grant access to another account.

The publishable key is designed for browser use. Never add a `service_role` or secret key to this repository. Access to `family_schedules` is protected by the row-level security policies in `supabase/schema.sql`.
