# KidsSync cloud accounts

KidsSync uses Supabase Auth and one row-level-secured schedule row per account. Guest mode continues to work without this setup, but cross-device accounts require it.

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

The publishable key is designed for browser use. Never add a `service_role` or secret key to this repository. Access to `family_schedules` is protected by the row-level security policies in `supabase/schema.sql`.
