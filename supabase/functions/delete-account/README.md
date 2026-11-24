# Account deletion deployment and acceptance

This feature is implemented but **not deployed by writing these files**. The
App Store candidate is not ready until its live readiness check, disposable
account deletion and signed-device acceptance pass. Existing family accounts
must not be used to test deletion.

## Contract

- Authenticated `GET /functions/v1/delete-account` returns
  `{ "available": true, "version": 1 }` only when the migration's cleanup trigger
  is bound to the expected `BEFORE DELETE FOR EACH ROW` function and the
  active-account access policies and row security are present and enabled.
- Authenticated `POST` accepts exactly `{ password, confirmationEmail }`.
  It verifies the live Auth user, reauthenticates the same email/password,
  verifies the original actor again and calls server-side Auth hard deletion.
  A client-provided target ID is never accepted. Accounts with verified MFA
  factors also require an already-verified second-factor session.
- Success is `{ "deleted": true }`. No client data is erased before that
  confirmation. Failed or uncertain requests never claim success.
- Service-role credentials exist only in the function's server environment.
  Never put them in Expo config, the app bundle, a public environment variable,
  screenshots, logs or Git.

## Deployment order

1. Review and apply `supabase/account-deletion.sql` to the **existing** KidsSync
   Supabase project after the base schema and collaboration migrations. The
   additive migration does not itself delete any account. It installs a
   transaction-scoped `BEFORE DELETE` Auth trigger and restrictive account-active
   RLS policies, preserving the existing policies and anonymous sharing behavior.
2. Deploy the `delete-account` Edge Function to that same project using the
   official Supabase CLI. Keep the default `verify_jwt=true` gateway check on;
   do not deploy with `--no-verify-jwt` to work around an authentication failure.
3. The function uses Supabase's server-provided `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Confirm those remain
   server-only and the deployment corresponds to the app's existing project.
4. Sign into a separately authorized disposable test account and open
   Account → Delete account. If readiness is unavailable, the password and
   destructive action stay unavailable; diagnose deployment rather than bypassing
   the check. Do not claim an App Store-ready build with this state unresolved.

## Data handling

The Auth deletion and app-data cleanup run in the same database transaction.
Cleanup removes owned schedules, owned calendar history, authored comments,
memberships and pending email invitations. It clears pickup references that
would otherwise block deletion through `assigned_by`, and anonymizes the actor
attribution retained in other owners' history. Other owners' calendar events
remain intact. Known Auth IDs take precedence over recycled email addresses.
A failed Auth deletion rolls back this cleanup.

Restrictive policies check that an authenticated user's Auth row still exists.
This closes access through an already-issued JWT that would otherwise remain
valid until expiry. Existing shared-write RPCs still require current membership;
deletion removes that membership. Do not change JWT validation or grant broader
access to make the feature work.

The current app stores calendar files locally, not in Supabase Storage. If a
future feature adds user-owned Storage objects, extend deletion to handle their
ownership before enabling it; Auth refuses to delete an owner with such objects.
Unexpected ownership failures currently produce a failure rather than a partial
success claim.

On this phone, confirmed deletion invalidates the account's old store instances,
drains queued writes, cancels its managed reminders and clears account-scoped
caches, outbox, preferences, notes, polls and packing data. Another account's
data, unclaimed guest previews and device language stay intact. A claimed
preview is removed only when it belongs to the deleted account. Device cleanup
failures have a separate receipt and retry; retry never sends another account
deletion request. Confirmed cleanup markers support recovery after reopening;
each pending account is offered in the same session. Dismissing a failed cleanup
keeps its marker for a later retry, and repeated Done taps cannot skip an account.
No remote device erasure or physical-notification delivery is implied.

## Verification

Run the repository's normal `node --test tests/*.test.cjs` suite. The Edge handler
tests inject server clients and exercise actual Request/Response boundaries;
native tests exercise the compiled settings and app handlers with fake network
boundaries. No live account is deleted by these tests.

For the separate real-PostgreSQL tests, install `@electric-sql/pglite` in a
temporary directory and point `KIDSSYNC_PGLITE_MODULE` to it, then run:

```sh
node --test tests/account-deletion-postgres.cjs
```

The PostgreSQL harness applies the actual schema, collaboration migrations and
deletion migration to an isolated database. It tests cleanup, rollback,
readiness, stale-token access and identity/email isolation.

Live acceptance must use newly created, explicitly authorized disposable
accounts. Verify the website and signed iPhone candidate lose access, another
family retains its calendar, local cleanup finishes and the old password cannot
sign in. Test failure/cancellation and remove only the captured test records.

## Remaining launch inputs

The native Privacy & your data page is a factual overview, **not** a substitute
for an owner-approved public privacy policy. No publisher identity, support
email or approved privacy/support URL was supplied for this slice. Do not
publish a personal authentication email or invent a working URL. Those public
launch inputs, deployed backend acceptance, signing and TestFlight-device tests
remain release gates coordinated by the release-owning chat.
