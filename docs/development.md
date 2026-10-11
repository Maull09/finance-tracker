# Development guide

## Prerequisites

- Node.js 22.12+ (22.x) or Node.js 24.x, with npm. Next.js 16 supports Node.js 20.9+, but the checked-in Vitest 5 dependency requires a newer runtime for development and tests.
- A Supabase project.

## Environment

Create `.env` in the repository root. In Supabase, open **Connect** and copy the connection string that matches your use case.

```env
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@[POOLER-HOST]:6543/postgres?sslmode=verify-full
DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Use the **Transaction pooler** URL for serverless deployments. Use the **Direct connection** URL or **Session pooler** (port 5432) for migrations and backups. The Session pooler supports IPv4-only networks. Copy the URL from Supabase; pooler hosts and usernames are project-specific. Do not commit `.env` or expose it with a `NEXT_PUBLIC_` prefix.

The two `NEXT_PUBLIC_SUPABASE_*` values come from the same project's API settings and are intentionally public. Never use a secret/service-role key in their place. Set them before building, since Next.js embeds public variables into the client bundle. See [authentication setup](authentication.md) for email confirmation, ownership migration, and session verification.

## Public-page SEO

Before a public deployment, set the server-only `SITE_URL` to the site's canonical
HTTPS origin, for example `SITE_URL=https://finance.example.com`, without a path,
query, or fragment. Set it before `npm run build` and rebuild when the domain
changes. It supplies the homepage canonical URL, absolute Open Graph/Twitter
image URLs, and `/sitemap.xml`. Without it, these URLs are omitted and the
sitemap is empty, so local builds do not advertise a guessed production domain.

Only the landing page belongs in the sitemap. Sign-in, sign-up, dashboard, auth,
and API responses use `X-Robots-Tag: noindex, nofollow`; account and dashboard
pages also include robots metadata. `/robots.txt` allows crawlers to read the
page-level `noindex` rules and skips API/auth endpoints. Authentication continues
to control access to private data.

Metadata uses English to match the initial server-rendered HTML. English and
Indonesian SEO copy lives in `src/lib/i18n/`; the saved language preference
remains client-side and does not create separate language URLs or `hreflang`
alternates. After changing preview copy, regenerate the static branded image
with `npx tsx scripts/generate-social-preview.tsx`. Its local Geist font and
license live in `src/assets/fonts/`.

## Automatic AI insight worker

Automatic page insights use BullMQ with a separate Redis instance and a long-running Node worker. The cache Redis below uses eviction and is unsuitable for a job queue. Start the persistent queue with Docker Desktop running:

```bash
docker compose up -d insights-redis
docker compose exec insights-redis redis-cli ping
```

Add the server-only variable `INSIGHTS_REDIS_URL=redis://127.0.0.1:6380` to `.env`. Use the same queue URL, `DATABASE_URL`, database CA configuration, `OLLAMA_BASE_URL`, and `OLLAMA_MODEL` for the app and worker; see [AI setup](ai-assistant.md). Apply the existing migrations through 0013 before using insights. This feature adds no database migration.

In a second terminal, run:

```bash
npm run worker:insights
```

The worker loads `.env` when present and also accepts deployment environment variables. It uses the repository's restricted database role and user ownership policies, releases the database during inference, and saves successful explanations in AI conversation history. It never changes financial records. Twenty new or manually retried jobs per user per minute are admitted; cache hits do not count. BullMQ processes one insight globally across all worker instances. This limit applies to page insights; chat and receipt requests retain their existing limits.

Completed insights are reused within 15-minute cache windows, separated by user, page, canonical filters/inputs, language, financial and market-data revisions, and Jakarta date. A new revision makes old results unavailable. Jobs waiting more than five minutes fail without model inference; inference has a 120-second timeout, with two attempts and exponential retry delay. Reanalyse retries the existing job. Completed-job retention targets 24 hours or 500 entries; failed-job retention targets one hour or 500 entries. Periodic cleanup runs while the worker is active; stopped workers cannot clean retained jobs. API responses expose only status and the authenticated user's explanation, never queue payloads or internal errors.

The queue Redis binds to loopback, uses `noeviction`, and persists AOF data in the `insights-queue` volume, following [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production). Stop it with `docker compose stop insights-redis`; the volume survives restarts. Do not remove the volume to clear ordinary application cache. Queue data and generated insights are private financial data: keep Redis on a private network and use an authenticated `rediss://` connection for remote Redis. Keep all connection values out of Git.

Run the worker on a VPS/container or the machine that can reach Ollama. A Vercel request or cron invocation is not a worker host. Install dependencies with `npm ci`, configure the environment, run `npm run worker:insights` under a process supervisor with automatic restarts, and allow up to 150 seconds for graceful shutdown. Worker startup fails if Redis cannot be reached; running workers reconnect after disconnection. Restart the app after environment changes. If insights remain waiting, check the worker's ready message and that both processes use the same queue. Ordinary financial pages remain usable when insight services fail.

Real queue tests use `INSIGHTS_REDIS_TEST_URL=redis://127.0.0.1:6380` and `npx vitest run tests/lib/ai/insight-queue.integration.test.ts`. They use an isolated queue and synthetic data, then delete only their own keys. DOM tests cover automatic requests, polling, retry, identity/language changes, and cancellation during navigation. The PostgreSQL tests in `tests/lib/server/financial-health.integration.test.ts` also verify aggregates for every page and isolation between users, using an empty disposable local database ending in `_health_test` via `FINANCIAL_HEALTH_TEST_DATABASE_URL`.

## Local Redis cache

Start the cache with Docker Desktop running:

```bash
docker compose up -d redis
docker compose exec redis redis-cli ping
```

Add `REDIS_URL=redis://127.0.0.1:6379` to your local `.env`, apply migration
`0011_redis_api_cache` with `npm run db:migrate`, then restart the application.
Follow the [migration guide](database-migrations.md) and back up existing financial
data before migrating. The migration adds cache revision metadata and triggers;
it preserves existing financial records and amounts. Redis binds only to the
local loopback address, limits memory to 128 MB, and does not persist cached data.
Stop it with `docker compose stop redis`.

Authenticated financial GET endpoints cache successful JSON results for 60 seconds.
Keys separate users, origins, paths, query parameters, and the Jakarta calendar
date. Authentication and PostgreSQL ownership checks still run on every request.
Database triggers change a user's cache revision in the same transaction as each
financial write; shared market data changes a global revision. Old entries then
become unreachable and expire naturally, including after writes made while Redis
was unavailable. Cache writes happen only after the database transaction commits.

The `X-Finance-Cache` response header reports `HIT`, `MISS`, or `BYPASS`.
Responses retain `Cache-Control: private, no-store` for browsers and proxies.
Without `REDIS_URL`, the app reads PostgreSQL directly. Redis failures also use
live database reads, with one-second connection/command timeouts. PostgreSQL
remains authoritative; mutations, failed responses, and cookie-setting responses
are never cached. For hosted Redis, use an authenticated `rediss://` URL as
recommended in the [Redis connection guide](https://redis.io/docs/latest/develop/clients/nodejs/connect/).
Keep `REDIS_URL` server-only and out of source control.

For the real Redis integration tests, set `REDIS_TEST_URL=redis://127.0.0.1:6379`
when running `npm test`. To also verify transactional invalidation against
PostgreSQL, provide the disposable local `AUTH_TEST_DATABASE_URL` described in
the [authentication verification guide](authentication.md#verification).

## Commands

Test files live in `tests/`, grouped by the matching application modules (`lib/`, `db/`, `components/`, `app/`) and operational scripts (`scripts/`). Application imports use the existing `@/` alias. Run `npm test` for the full suite or, for example, `npx vitest run tests/lib/ai` for one module. Integration test environment requirements remain as described above and in the focused setup documents.

Use `npm ci` to install the exact versions in the committed lockfile. Use `npm install` when intentionally updating dependencies, and commit the manifest and lockfile together.

```bash
npm install
npm run dev
npm run lint
npm run build
npm test
npm run db:generate
npm run db:migrate
npm run db:check
```

`db:generate` creates a Drizzle migration after a schema change. `db:migrate` applies existing migrations and verifies required schema objects. `db:check` is read-only. Back up financial data before applying a migration; see the [migration and recovery guide](database-migrations.md) if existing tables have no migration history.

The Verify workflow supplies dummy loopback database and Supabase values only
for its build step. Next.js imports server modules while collecting route
configuration, so `DATABASE_URL` must be present even though the build does not
query the database. CI does not need production secrets or running services for
this check. Deployment builds require the real environment values above;
the CI artifact is not configured for deployment.

## Database

Drizzle schema definitions are in `src/db/schema.ts`; generated migrations are in `drizzle/`. The first migration preserves legacy transactions by assigning them to an `Uncategorized account`. Move them to their real account after migrating.

Migration `0003_wild_ultimo.sql` adds stock portfolios, price history, watchlists, and sinking funds. Apply it before running this version, since cash queries now include the stock ledger. Daily pricing uses Yahoo Finance without an API key; the scheduled endpoint still requires `CRON_SECRET`. See [investment and planning setup](investments-and-planning.md).

Migration `0004_clumsy_jane_foster.sql` enables decimal trade quantities/prices and removes the whole-lot constraint. Existing trade values are preserved. Cash and partial-sale cost allocations now use cent precision; API validation rejects excess input precision instead of silently truncating it.

Migration `0005_concerned_ego.sql` widens trade prices from `numeric(14, 2)` to `numeric(16, 4)`, preserving existing values and integer capacity. Apply it before recording four-decimal prices. Per-share prices display four decimal places; cash totals still round to two. Migration generation alone does not update Supabase.

Switching daily prices from Twelve Data to Yahoo Finance requires updated npm dependencies and an application restart, not another migration. The price writer explicitly stores `Yahoo Finance` as its source; historical quotes keep their source until that same ticker/date is successfully refreshed. The historical database source default is unchanged. The old Twelve Data environment key can be removed locally; it is no longer read by the app.

## Troubleshooting

- **Cannot connect to the database:** verify that `DATABASE_URL` comes from Supabase Connect, is URL-encoded where required, and uses SSL. For a project CA that is not in the host trust store, set `DATABASE_CA_CERT` to the PEM value from Supabase; multiline, escaped `\n`, and single-line PEM values are supported.
- **Missing `stock_trades`:** run `npm run db:migrate -- --check`, then follow the [migration and recovery guide](database-migrations.md). Successful account queries do not prove that all feature tables exist.
- **Migration fails:** make sure the connection targets the intended database. Use Direct connection or the Session pooler for migration work. Do not force schema pushes, drop application tables, or invent migration history to suppress an error.
- **Build fails with `DATABASE_URL is missing`:** configure the environment values above before building. The Verify workflow uses build-only placeholders; do not use them for a deployment.
- **Lint fails:** run `npm run lint` to identify the reported source file and rule. Next.js 16 uses the ESLint CLI rather than `next lint`.
- **Tests fail:** run `npm test` to identify the failed financial scenario.
