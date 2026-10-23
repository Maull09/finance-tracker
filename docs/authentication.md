# Authentication and data ownership

Finance Tracker uses Supabase Auth email/password authentication and cookie-based sessions through `@supabase/ssr`. `/` is the public landing page; `/sign-in` and `/sign-up` lead to `/dashboard`. The dashboard exposes session/user state through `AuthProvider` and `useAuth`, hides financial content when the session ends, and supports sign out in the sidebar. Both interface languages are supported.

## Supabase setup

1. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env` and the deployment environment. Use the project that owns `DATABASE_URL`; never supply a service-role/secret key to the browser. Public variables must be present at build time.
2. Enable the email/password provider and email confirmation in Supabase Auth. Configure a minimum password length of at least eight characters. Supabase enforces authentication rate limits; configure production SMTP and provider limits for your deployment.
3. Configure the Site URL to your production origin. Allow `http://localhost:3000/auth/confirm` for local development and your production `/auth/confirm` URL in the redirect allowlist.
4. Set the **Confirm signup** email link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. This token-hash flow supports confirmation on another browser/device. For local testing, use the local origin as Site URL. The confirmation handler also accepts a PKCE `code` from the default email flow (which requires the originating browser).
5. Restart development or rebuild production after configuring the public variables. Create and confirm an account before assigning legacy data.

See the official [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [Next.js auth tutorial](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs).

### Testing through ngrok

When sharing `next dev` through a tunnel, add the tunnel's exact hostname (without `https://` or a port) to `allowedDevOrigins` in `next.config.ts`, then restart the dev server. Update the entry when the tunnel hostname changes; avoid allowing every ngrok domain. A blocked development WebSocket can leave the page visible without activating its form. Check that the show-password button responds before testing sign in. Auth fields remain disabled until the client activates, and the form uses POST so a native submission cannot put credentials in the URL.

Email/password sign-in calls Supabase directly and then navigates to a local dashboard path. Email confirmation separately needs the tunnel's `/auth/confirm` URL in the Supabase redirect allowlist; use the tunnel as Site URL when testing the existing confirmation email template. These URL settings do not repair an inactive client form.

## Apply ownership migrations

Back up the financial database and stop application writes first. Use a Direct connection or Session pooler for migrations. Apply `0006_auth_ownership` and `0007_auth_policies` with `npm run db:migrate`; verify with `npm run db:migrate -- --check`.

Migration 0006 adds nullable `user_id` fields to 13 private tables and gives watchlists a per-user unique ticker. Existing rows and amounts are preserved with no owner until an explicit assignment. Migration 0007 creates the non-login, non-superuser, non-BYPASSRLS `finance_user` role, grants membership to the migration connection user, enables ownership policies, and revokes direct table access from Supabase `anon`/`authenticated` roles. This app accesses financial data through Next.js APIs, not the Supabase Data API. Shared instrument and price data has separate policies.

If the runtime database connection uses a different role, grant `finance_user` membership to that trusted server role before starting the app. Never grant this role to public/client roles. The runtime transaction must be able to execute `SET LOCAL ROLE finance_user`; otherwise financial requests fail closed. The schema and auth readiness check validates the role, table RLS flags, and ownership policy presence. It is not a full audit of all PostgreSQL privileges or policy expressions.

Assign the legacy records to the intended confirmed Supabase user, first previewing the counts:

```bash
npm run db:assign-owner -- --email=owner@example.com
npm run db:assign-owner -- --email=owner@example.com --apply
```

The command changes only unowned rows, in one transaction. It refuses missing/unconfirmed owners and conflicting watchlist notes. Existing owned rows are untouched. It never creates an Auth account, changes passwords, or automatically claims data for the first signup. Perform assignment before the owner starts adding records. Repeating an assignment with no remaining unowned rows changes nothing.

## Server boundaries

- The Next.js proxy refreshes cookies for dashboard and auth pages. Every financial API independently verifies identity with `auth.getUser()`; client session state is never used to authorize database access.
- Financial handlers receive a transaction-scoped connection from `authenticatedResponse`. It switches to `finance_user` and sets the verified user ID with transaction-local settings, using serializable isolation. Helpers receive that connection explicitly. Nested financial writes use savepoints in the same transaction.
- PostgreSQL policies filter reads/updates/deletes, stamp ownership on inserts, reject forged ownership, and check ownership of referenced accounts, goals, debts, funds, and transactions. Foreign keys alone do not protect cross-user references.
- API responses use `private, no-store`. Expired sessions return 401; the client returns to sign in. Cross-site requests are rejected. Redirect destinations are restricted to local dashboard paths.
- `/api/jobs/stock-prices` retains its separate `CRON_SECRET` authorization and privileged cross-user price refresh. Public market quotes are shared; personal watchlist notes and holdings remain private.

## Verification

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`. PostgreSQL integration tests require `AUTH_TEST_DATABASE_URL` pointing to an **empty, disposable, local database whose name ends in `_auth_test`**. The test database role must be able to create roles; the cluster must not already contain `finance_user`. These tests apply all migrations and exercise isolation, foreign-account rejection, connection reuse, and legacy assignment. Without that variable, only the PostgreSQL integration suite is skipped.

Before deployment, use two confirmed test users to check signup confirmation, sign in, reload/session refresh, cross-tab sign out, expired-session redirects, and private API access. Do not test with someone else's financial records.
