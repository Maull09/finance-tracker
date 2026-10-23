import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq, isNotNull, isNull } from "drizzle-orm"
import { aiDrafts, transactions, recurringTransactions } from "@/db/schema"
import { decideDraft } from "@/lib/ai/confirmation"
import { readLedger, readReservations } from "@/lib/server/ledger"
import { readBalanceLedger, readReservedCash, accountSummaryQuery, goalSummaryQuery, debtSummaryQuery } from "@/lib/server/financial-queries"
import { readBudgets } from "@/lib/server/budget-queries"
import { readDashboardLedger } from "@/lib/server/dashboard-queries"
import { readTransactionPage } from "@/lib/server/transaction-queries"
import { parseTransactionFilters } from "@/lib/transaction-filters"
import { transactionConditions } from "@/lib/server/transaction-conditions"
import { readLatestPrices } from "@/lib/server/market-queries"
import { tradeCashChange } from "@/lib/investments"
import { assignLegacyOwner } from "../../scripts/db-assign-owner.mjs"
import { schemaIssues, loadSnapshot, readDatabaseSchema } from "../../scripts/db-schema.mjs"
import { verifyAuthReadiness } from "../../scripts/auth-readiness.mjs"
import { ownedTables } from "../../scripts/auth-tables.mjs"
import { apiCacheKey, readApiCache, writeApiCache } from "@/lib/server/api-cache"
import { getRedisClient } from "@/lib/server/redis"
import { recurringSchedulesQuery } from "@/lib/server/recurring-queries"
import { recordRecurringOccurrence } from "@/lib/server/recurring-recording"
import { scheduleOccurrences } from "@/lib/planning"

const testUrl = process.env.AUTH_TEST_DATABASE_URL
const redisTestUrl = process.env.REDIS_TEST_URL
const userA = "00000000-0000-4000-8000-000000000001"
const userB = "00000000-0000-4000-8000-000000000002"

describe.skipIf(!testUrl)("PostgreSQL ownership policies", () => {
  let client
  let accountA
  let accountB
  let legacyId
  let legacyScheduleId
  let legacyTransactionId
  let redisCacheUsed = false

  async function asUser(id, action) {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    try {
      await client.query("SET LOCAL ROLE finance_user")
      if (id) await client.query("SELECT set_config('app.user_id', $1, true)", [id])
      const result = await action()
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  }

  beforeAll(async () => {
    const url = new URL(testUrl)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_auth_test"))
      throw new Error("Use a disposable local database ending in _auth_test")
    client = new pg.Client({ connectionString: testUrl })
    await client.connect()
    const existing = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    if (existing.rowCount) throw new Error("Auth tests require an empty disposable database")
    await client.query("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN")
    await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated")
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries
    for (const migration of journal) {
      if (migration.idx === 6) {
        legacyId = (await client.query("INSERT INTO accounts (name, type, initial_balance) VALUES ('Legacy', 'bank', 12345) RETURNING id")).rows[0].id
        await client.query("INSERT INTO stock_instruments (symbol, name) VALUES ('BBRI', 'BBRI')")
        await client.query("INSERT INTO stock_watchlist (symbol, note) VALUES ('BBRI', 'Legacy note')")
      }
      if (migration.idx === 15) {
        legacyScheduleId = (await client.query("INSERT INTO recurring_transactions(name,type,amount,category,account_id,start_date,last_executed_date) VALUES ('Old schedule','expense',5000,'Makanan',$1,'2026-08-31','2026-09-30') RETURNING id", [legacyId])).rows[0].id
        legacyTransactionId = (await client.query("INSERT INTO transactions(type,amount,category,date,account_id) VALUES ('expense',5000,'Makanan','2026-09-20',$1) RETURNING id", [legacyId])).rows[0].id
      }
      await client.query("BEGIN")
      for (const statement of readFileSync(`drizzle/${migration.tag}.sql`, "utf8").split("--> statement-breakpoint"))
        await client.query(statement)
      await client.query("COMMIT")
    }
    await client.query("CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz)")
    await client.query("INSERT INTO auth.users VALUES ($1, 'owner@example.test', now()), ($2, 'other@example.test', now())", [userA, userB])
    accountA = (await asUser(userA, () => client.query("INSERT INTO accounts (name, type) VALUES ('A', 'bank') RETURNING id, user_id"))).rows[0]
    accountB = (await asUser(userB, () => client.query("INSERT INTO accounts (name, type) VALUES ('B', 'bank') RETURNING id, user_id"))).rows[0]
    await client.query("INSERT INTO stock_instruments (symbol, name) VALUES ('BBCA', 'BBCA')")
  }, 30000)

  afterAll(async () => {
    await client?.end()
    if (redisCacheUsed) {
      const redis = await getRedisClient()
      await redis?.close()
      vi.unstubAllEnvs()
    }
  })

  it("applies migrations without losing legacy amounts or watchlist notes", async () => {
    expect((await client.query("SELECT initial_balance, user_id FROM accounts WHERE id = $1", [legacyId])).rows[0]).toEqual({ initial_balance: 12345, user_id: null })
    expect((await client.query("SELECT note FROM stock_watchlist")).rows[0].note).toBe("Legacy note")
    expect(schemaIssues(loadSnapshot("0015"), await readDatabaseSchema(client))).toEqual([])
    expect((await client.query("SELECT last_executed_date::text, recorded_through_date::text FROM recurring_transactions WHERE id=$1", [legacyScheduleId])).rows[0])
      .toEqual({ last_executed_date: "2026-09-30", recorded_through_date: "2026-09-30" })
    expect((await client.query("SELECT amount, recurring_id, scheduled_date FROM transactions WHERE id=$1", [legacyTransactionId])).rows[0])
      .toEqual({ amount: 5000, recurring_id: null, scheduled_date: null })
  })

  it("records early and late periods once, preserves other periods, and uses actual dates for cash flow", async () => {
    await asUser(userA, async () => {
      await client.query("SAVEPOINT occurrence_fixture")
      try {
        const connection = drizzle(client)
        const account = (await client.query("INSERT INTO accounts(name,type,initial_balance) VALUES ('Occurrence cash','cash',1000000) RETURNING id")).rows[0].id
        const id = (await client.query("INSERT INTO recurring_transactions(name,type,amount,category,subcategory,account_id,start_date,end_date) VALUES ('Coffee','expense',25000,'Minuman','Kopi',$1,'2026-01-31','2026-03-31') RETURNING id", [account])).rows[0].id
        const readSchedule = async () => (await recurringSchedulesQuery(connection).where(eq(recurringTransactions.id, id)))[0]
        const early = await recordRecurringOccurrence(connection, id, { scheduledDate: "2026-03-31", date: "2026-01-20", amount: 30000 })
        expect(early).toMatchObject({ date: "2026-01-20", scheduledDate: "2026-03-31", amount: 30000, subcategory: "Kopi" })
        expect(scheduleOccurrences(await readSchedule(), "2026-01-01", "2026-04-30").map((item) => item.date)).toEqual(["2026-01-31", "2026-02-28"])
        expect((await readSchedule()).amount).toBe(25000)
        expect(scheduleOccurrences(await readSchedule(), "2026-01-01", "2026-04-30").map((item) => item.amount)).toEqual([25000, 25000])
        const late = await recordRecurringOccurrence(connection, id, { scheduledDate: "2026-01-31", date: "2026-04-15", amount: 40000 })
        await recordRecurringOccurrence(connection, id, { scheduledDate: "2026-02-28", date: "2026-04-15", amount: 25000 })
        expect((await client.query("SELECT scheduled_date::text FROM transactions WHERE recurring_id=$1 ORDER BY scheduled_date", [id])).rows)
          .toEqual([{ scheduled_date: "2026-01-31" }, { scheduled_date: "2026-02-28" }, { scheduled_date: "2026-03-31" }])
        expect((await readSchedule()).recordedDates.sort()).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"])
        expect(scheduleOccurrences(await readSchedule(), "2026-01-01", "2026-04-30")).toEqual([])
        await expect(recordRecurringOccurrence(connection, id, { scheduledDate: "2026-03-31", date: "2026-04-16", amount: 30000 })).rejects.toMatchObject({ code: "scheduleAlreadyRecorded" })
        expect((await accountSummaryQuery(connection, [account]))[0].balance).toBe(905000)
        const filters = parseTransactionFilters(new URLSearchParams({ account: String(account), from: "2026-04-01", to: "2026-04-30" }))
        expect(await readTransactionPage(connection, transactionConditions(filters), 1, 25)).toMatchObject({ total: 2, summary: { expense: 65000 } })
        await client.query("DELETE FROM transactions WHERE id=$1", [late.id])
        expect(scheduleOccurrences(await readSchedule(), "2026-01-01", "2026-04-30").map((item) => item.date)).toEqual(["2026-01-31"])
        await client.query("DELETE FROM recurring_transactions WHERE id=$1", [id])
        expect((await client.query("SELECT amount,recurring_id FROM transactions WHERE id=$1", [early.id])).rows[0]).toEqual({ amount: 30000, recurring_id: null })
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT occurrence_fixture")
      }
    })
  })

  it("rejects links to another user's schedule", async () => {
    const id = (await asUser(userA, () => client.query("INSERT INTO recurring_transactions(name,type,amount,category,account_id,start_date) VALUES ('Private schedule','expense',100,'Makanan',$1,'2026-10-01') RETURNING id", [accountA.id]))).rows[0].id
    try {
      await expect(asUser(userB, () => recordRecurringOccurrence(drizzle(client), id, { scheduledDate: "2026-10-01", date: "2026-10-02", amount: 100 }))).rejects.toMatchObject({ code: "recordMissing" })
      await expect(asUser(userB, () => client.query("INSERT INTO transactions(type,amount,category,account_id,date,recurring_id,scheduled_date) VALUES ('expense',100,'Makanan',$1,'2026-10-02',$2,'2026-10-01')", [accountB.id, id]))).rejects.toMatchObject({ code: "42501" })
    } finally {
      await asUser(userA, () => client.query("DELETE FROM recurring_transactions WHERE id=$1", [id]))
    }
  })

  it("allows only one concurrent recording for a scheduled occurrence", async () => {
    const id = (await asUser(userA, () => client.query("INSERT INTO recurring_transactions(name,type,amount,category,account_id,start_date) VALUES ('Concurrent schedule','expense',100,'Makanan',$1,'2026-10-01') RETURNING id", [accountA.id]))).rows[0].id
    const clients = [new pg.Client({ connectionString: testUrl }), new pg.Client({ connectionString: testUrl })]
    try {
      await Promise.all(clients.map((connection) => connection.connect()))
      const results = await Promise.allSettled(clients.map(async (connection) => {
        await connection.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
        try {
          await connection.query("SET LOCAL ROLE finance_user")
          await connection.query("SELECT set_config('app.user_id', $1, true)", [userA])
          const transaction = await recordRecurringOccurrence(drizzle(connection), id, { scheduledDate: "2026-10-01", date: "2026-10-02", amount: 100 })
          await connection.query("COMMIT")
          return transaction
        } catch (error) {
          await connection.query("ROLLBACK")
          throw error
        }
      }))
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
      expect(Number((await client.query("SELECT count(*) FROM transactions WHERE recurring_id=$1", [id])).rows[0].count)).toBe(1)
    } finally {
      await Promise.all(clients.map((connection) => connection.end()))
      await asUser(userA, async () => {
        await client.query("DELETE FROM transactions WHERE recurring_id=$1", [id])
        await client.query("DELETE FROM recurring_transactions WHERE id=$1", [id])
      })
    }
  })

  it("adds optional subcategories without rewriting existing transactions or schedules", async () => {
    await client.query("BEGIN")
    try {
      await client.query("ALTER TABLE transactions DROP COLUMN subcategory; ALTER TABLE recurring_transactions DROP COLUMN subcategory")
      const transaction = (await client.query("INSERT INTO transactions(user_id,type,amount,category,group_name,date,account_id) VALUES ($1,'expense',12345,'Makanan','Existing group','2026-10-23',$2) RETURNING id", [userA, accountA.id])).rows[0]
      const schedule = (await client.query("INSERT INTO recurring_transactions(user_id,name,type,amount,category,account_id,start_date) VALUES ($1,'Existing schedule','expense',23456,'Tagihan',$2,'2026-10-23') RETURNING id", [userA, accountA.id])).rows[0]
      for (const statement of readFileSync("drizzle/0014_brown_santa_claus.sql", "utf8").split("--> statement-breakpoint"))
        await client.query(statement)
      expect((await client.query("SELECT amount,category,subcategory,group_name FROM transactions WHERE id=$1", [transaction.id])).rows[0])
        .toEqual({ amount: 12345, category: "Makanan", subcategory: null, group_name: "Existing group" })
      expect((await client.query("SELECT amount,category,subcategory FROM recurring_transactions WHERE id=$1", [schedule.id])).rows[0])
        .toEqual({ amount: 23456, category: "Tagihan", subcategory: null })
    } finally {
      await client.query("ROLLBACK")
    }
  })

  it("filters subcategories across pages while budgets and dashboard keep parent totals private", async () => {
    await asUser(userA, async () => {
      await client.query("SAVEPOINT category_fixture")
      try {
        const connection = drizzle(client)
        const accountId = (await client.query("INSERT INTO accounts(name,type) VALUES ('Category fixture','bank') RETURNING id")).rows[0].id
        await client.query("INSERT INTO transactions(type,amount,category,subcategory,date,account_id) SELECT 'expense',100,'Minuman','Kopi','2026-10-23',$1 FROM generate_series(1,26)", [accountId])
        await client.query("INSERT INTO transactions(type,amount,category,subcategory,date,account_id) VALUES ('expense',200,'Minuman','Teh','2026-10-23',$1),('expense',300,'Minuman',null,'2026-10-23',$1)", [accountId])
        await client.query("INSERT INTO budgets(category,budget,period_start) VALUES ('Minuman',5000,'2026-10-01')")
        const filters = parseTransactionFilters(new URLSearchParams({ category: "Minuman", subcategory: "Kopi", account: String(accountId) }))
        const page = await readTransactionPage(connection, transactionConditions(filters), 2, 2)
        expect(page).toMatchObject({ total: 26, page: 2, summary: { income: 0, expense: 2600 } })
        expect(page.items).toHaveLength(2)
        expect(page.items.every((item) => item.category === "Minuman" && item.subcategory === "Kopi")).toBe(true)
        const search = parseTransactionFilters(new URLSearchParams({ search: "coffee", account: String(accountId) }))
        expect(await readTransactionPage(connection, transactionConditions(search), 1, 25)).toMatchObject({ total: 26 })
        expect((await readBudgets(connection, "2026-10-01", "2026-11-01", "2026-09-01")).find((row) => row.category === "Minuman"))
          .toMatchObject({ spent: 3100, budget: 5000 })
        const dashboard = await readDashboardLedger(connection, {
          historyStart: "2026-10-01", historyEnd: "2026-11-01", previousStart: "2026-09-01",
          periodEnd: "2026-11-01", recentStart: "2026-10-01", today: "2026-10-23",
        })
        expect(dashboard.transactions.find((row) => row.category === "Minuman")).toMatchObject({ amount: 3100 })
        await client.query("SELECT set_config('app.user_id', $1, true)", [userB])
        expect(await readTransactionPage(connection, transactionConditions(filters), 1, 25)).toMatchObject({ items: [], total: 0 })
        expect((await readBudgets(connection, "2026-10-01", "2026-11-01", "2026-09-01")).some((row) => row.category === "Minuman")).toBe(false)
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT category_fixture")
      }
    })
  })

  it("automatically assigns new rows and isolates reads, updates, and deletes", async () => {
    expect(accountA.user_id).toBe(userA)
    expect(accountB.user_id).toBe(userB)
    await asUser(userB, async () => {
      expect((await client.query("SELECT id FROM accounts")).rows).toEqual([{ id: accountB.id }])
      expect((await client.query("UPDATE accounts SET name = 'stolen' WHERE id = $1", [accountA.id])).rowCount).toBe(0)
      expect((await client.query("DELETE FROM accounts WHERE id = $1", [accountA.id])).rowCount).toBe(0)
    })
  })

  it("adopts an existing grouping schema without changing recorded transactions", async () => {
    const fixture = (await asUser(userA, () => client.query(
      "INSERT INTO transactions(type,amount,category,group_name,date,account_id) VALUES ('expense',123,'Food','Existing trip','2026-10-09',$1) RETURNING id,amount,group_name",
      [accountA.id],
    ))).rows[0]
    await client.query("BEGIN")
    try {
      for (const statement of readFileSync("drizzle/0013_groovy_talkback.sql", "utf8").split("--> statement-breakpoint"))
        await client.query(statement)
      expect((await client.query("SELECT id,amount,group_name FROM transactions WHERE id=$1", [fixture.id])).rows[0]).toEqual(fixture)
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      await asUser(userA, () => client.query("DELETE FROM transactions WHERE id=$1", [fixture.id]))
    }
    await expect(asUser(userA, () => client.query(
      "INSERT INTO transactions(type,amount,category,group_name,date,account_id) VALUES ('expense',123,'Food','   ','2026-10-09',$1)", [accountA.id],
    ))).rejects.toMatchObject({ code: "23514" })
  })

  it("isolates AI conversations, messages, receipts and draft references between users", async () => {
    const conversation = (await asUser(userA, () => client.query("INSERT INTO ai_conversations(title) VALUES ('AI fixture') RETURNING id"))).rows[0].id
    const message = (await asUser(userA, () => client.query("INSERT INTO ai_messages(conversation_id, role, content) VALUES ($1, 'assistant', 'Draft') RETURNING id", [conversation]))).rows[0].id
    await asUser(userB, async () => {
      expect((await client.query("SELECT id FROM ai_conversations WHERE id = $1", [conversation])).rows).toEqual([])
      expect((await client.query("SELECT id FROM ai_messages WHERE id = $1", [message])).rows).toEqual([])
      expect((await client.query("UPDATE ai_conversations SET title = 'stolen' WHERE id = $1", [conversation])).rowCount).toBe(0)
    })
    await expect(asUser(userB, () => client.query("INSERT INTO ai_messages(conversation_id, role, content) VALUES ($1, 'user', 'Attack')", [conversation]))).rejects.toMatchObject({ code: "42501" })
    await expect(asUser(userB, () => client.query("INSERT INTO ai_receipts(conversation_id, storage_path, mime_type) VALUES ($1, 'fake', 'image/png')", [conversation]))).rejects.toMatchObject({ code: "42501" })
    const own = (await asUser(userB, () => client.query("INSERT INTO ai_conversations(title) VALUES ('Own AI fixture') RETURNING id"))).rows[0].id
    await expect(asUser(userB, () => client.query("INSERT INTO ai_drafts(conversation_id, message_id, data) VALUES ($1, $2, '{}')", [own, message]))).rejects.toMatchObject({ code: "42501" })
    for (const role of ["anon", "authenticated"]) {
      const grants = await client.query("SELECT has_table_privilege($1, 'ai_conversations', 'SELECT,INSERT,UPDATE,DELETE') AS access", [role])
      expect(grants.rows[0].access).toBe(false)
    }
  })

  it("atomically confirms a persisted AI draft once and rolls back a failed confirmation", async () => {
    const connection = drizzle(client)
    const data = { type: "expense", amount: 25000, category: "Makanan", description: "AI fixture", date: "2026-10-09", accountId: accountA.id, destinationAccountId: null }
    const conversation = (await asUser(userA, () => client.query("INSERT INTO ai_conversations(title) VALUES ('Confirmation fixture') RETURNING id"))).rows[0].id
    const message = (await asUser(userA, () => client.query("INSERT INTO ai_messages(conversation_id, role, content) VALUES ($1, 'assistant', 'Review') RETURNING id", [conversation]))).rows[0].id
    const draft = (await asUser(userA, () => client.query("INSERT INTO ai_drafts(conversation_id, message_id, data) VALUES ($1, $2, $3) RETURNING id", [conversation, message, JSON.stringify(data)]))).rows[0].id
    await expect(asUser(userA, async () => {
      await decideDraft(connection, draft, { action: "confirm", data })
      throw new Error("Rollback confirmation fixture")
    })).rejects.toThrow("Rollback confirmation fixture")
    const pending = await asUser(userA, () => connection.select().from(aiDrafts).where(eq(aiDrafts.id, draft)))
    expect(pending[0].status).toBe("pending")
    expect(pending[0].transactionId).toBeNull()
    const result = await asUser(userA, () => decideDraft(connection, draft, { action: "confirm", data }))
    expect(result.transactionId).toBeGreaterThan(0)
    await expect(asUser(userA, () => decideDraft(connection, draft, { action: "confirm", data }))).rejects.toMatchObject({ code: "recordConflict" })
    const saved = await asUser(userA, () => connection.select().from(transactions).where(eq(transactions.id, result.transactionId)))
    expect(saved).toHaveLength(1)
    expect(saved[0].amount).toBe(25000)
    await asUser(userA, async () => {
      await client.query("DELETE FROM ai_drafts WHERE id = $1", [draft])
      await client.query("DELETE FROM transactions WHERE id = $1", [result.transactionId])
    })
  })

  it("keeps receipt Storage private even when a preexisting policy permits broad access", async () => {
    await client.query("BEGIN")
    try {
      await client.query(`
        CREATE SCHEMA storage;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
          SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$
          SELECT string_to_array(name, '/')
        $$;
        CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
        CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        GRANT USAGE ON SCHEMA storage, auth TO anon, authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
        CREATE POLICY broad_existing_policy ON storage.objects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
      `)
      await client.query(readFileSync("scripts/ai-storage.sql", "utf8"))
      await client.query(readFileSync("scripts/ai-storage.sql", "utf8"))
      expect((await client.query("SELECT public, file_size_limit FROM storage.buckets WHERE id = 'ai-receipts'")).rows[0]).toEqual({ public: false, file_size_limit: "5242880" })
      await client.query("SET LOCAL ROLE authenticated")
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userA])
      await client.query("INSERT INTO storage.objects(bucket_id, name) VALUES ('ai-receipts', $1)", [userA + "/receipt.png"])
      expect((await client.query("SELECT name FROM storage.objects")).rowCount).toBe(1)
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userB])
      expect((await client.query("SELECT name FROM storage.objects")).rowCount).toBe(0)
      expect((await client.query("DELETE FROM storage.objects")).rowCount).toBe(0)
      await client.query("RESET ROLE; SET LOCAL ROLE anon")
      expect((await client.query("SELECT name FROM storage.objects")).rowCount).toBe(0)
      await client.query("SAVEPOINT denied_upload")
      await expect(client.query("INSERT INTO storage.objects(bucket_id, name) VALUES ('ai-receipts', $1)", [userB + "/receipt.png"])).rejects.toMatchObject({ code: "42501" })
      await client.query("ROLLBACK TO SAVEPOINT denied_upload")
    } finally { await client.query("ROLLBACK") }
  })

  it("installs revision triggers on every private financial and shared market table", async () => {
    const { rows } = await client.query("SELECT c.relname AS table_name, t.tgname AS trigger_name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace")
    for (const table of ownedTables.filter(name => !name.startsWith("ai_"))) {
      expect(rows).toContainEqual({ table_name: table, trigger_name: "invalidate_api_cache" })
      expect(rows).toContainEqual({ table_name: table, trigger_name: "invalidate_api_cache_truncate" })
    }
    for (const table of ["stock_prices", "stock_instruments"])
      expect(rows).toContainEqual({ table_name: table, trigger_name: "invalidate_api_cache" })
  })

  it("changes only the owner's cache revision for inserts, updates, and deletes", async () => {
    const revision = async user => (await asUser(user, () => client.query("SELECT revision FROM api_cache_revisions WHERE scope = $1", [user]))).rows[0].revision
    const unchangedB = await revision(userB)
    let previousA = await revision(userA)
    const created = (await asUser(userA, () => client.query("INSERT INTO accounts(name, type) VALUES ('Cache fixture', 'bank') RETURNING id"))).rows[0].id
    for (const action of [
      async () => {},
      () => asUser(userA, () => client.query("UPDATE accounts SET name = 'Updated cache fixture' WHERE id = $1", [created])),
      () => asUser(userA, () => client.query("DELETE FROM accounts WHERE id = $1", [created])),
    ]) {
      await action()
      const nextA = await revision(userA)
      expect(nextA).not.toBe(previousA)
      expect(await revision(userB)).toBe(unchangedB)
      previousA = nextA
    }
  })

  it("rolls back cache revisions with financial writes and prevents forged revisions", async () => {
    const before = (await asUser(userA, () => client.query("SELECT * FROM api_cache_revisions ORDER BY scope"))).rows
    expect(before.map(row => row.scope)).not.toContain(userB)
    await expect(asUser(userA, async () => {
      await client.query("UPDATE accounts SET name = 'Rolled back' WHERE id = $1", [accountA.id])
      throw new Error("rollback cache fixture")
    })).rejects.toThrow("rollback cache fixture")
    expect((await asUser(userA, () => client.query("SELECT * FROM api_cache_revisions ORDER BY scope"))).rows).toEqual(before)
    await expect(asUser(userA, () => client.query("UPDATE api_cache_revisions SET revision = gen_random_uuid() WHERE scope = $1", [userA]))).rejects.toMatchObject({ code: "42501" })
    await expect(asUser(userA, () => client.query("SELECT invalidate_private_api_cache()"))).rejects.toMatchObject({ code: "42501" })
  })

  it("revokes Supabase default grants on revision data and trigger functions", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await client.query("SELECT has_table_privilege($1, 'public.api_cache_revisions', 'SELECT') AS read, has_table_privilege($1, 'public.api_cache_revisions', 'INSERT,UPDATE,DELETE') AS write, has_function_privilege($1, 'public.invalidate_private_api_cache()', 'EXECUTE') AS private_function, has_function_privilege($1, 'public.invalidate_market_api_cache()', 'EXECUTE') AS market_function", [role])
      expect(rows[0]).toEqual({ read: false, write: false, private_function: false, market_function: false })
    }
  })

  it("invalidates both owners on ownership reassignment and all users for market changes", async () => {
    const revisions = async () => (await client.query("SELECT scope, revision FROM api_cache_revisions ORDER BY scope")).rows
    const before = await revisions()
    await client.query("BEGIN")
    try {
      await client.query("UPDATE accounts SET user_id = $1 WHERE id = $2", [userB, accountA.id])
      const moved = await revisions()
      for (const user of [userA, userB])
        expect(moved.find(row => row.scope === user).revision).not.toBe(before.find(row => row.scope === user).revision)
      await client.query("INSERT INTO stock_prices(symbol, price, date) VALUES ('BBCA', 100, '2026-10-09')")
      expect((await revisions()).find(row => row.scope === 'market').revision).not.toBe(moved.find(row => row.scope === 'market').revision)
    } finally { await client.query("ROLLBACK") }
    expect(await revisions()).toEqual(before)
  })

  it.skipIf(!redisTestUrl)("cannot revive stale data with a delayed Redis write after a committed mutation", async () => {
    const url = new URL(redisTestUrl)
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      throw new Error("Redis tests require a local server")
    vi.stubEnv("REDIS_URL", redisTestUrl)
    redisCacheUsed = true
    const request = new Request("http://localhost/api/accounts")
    const keyFor = user => asUser(user, () => apiCacheKey(drizzle(client), user, request))
    const oldKey = await keyFor(userA)
    const otherKey = await keyFor(userB)
    await asUser(userA, () => client.query("UPDATE accounts SET name = 'Cache mutation' WHERE id = $1", [accountA.id]))
    const nextKey = await keyFor(userA)
    expect(nextKey).not.toBe(oldKey)
    expect(await keyFor(userB)).toBe(otherKey)
    try {
      await writeApiCache(oldKey, '{"name":"Old snapshot"}')
      expect(await readApiCache(oldKey)).toBe('{"name":"Old snapshot"}')
      expect(await readApiCache(nextKey)).toBeNull()
      expect(await readApiCache(otherKey)).toBeNull()
    } finally {
      const redis = await getRedisClient()
      await redis.del(oldKey)
    }
  })

  it("rejects forged ownership and foreign accounts", async () => {
    await expect(asUser(userB, () => client.query("INSERT INTO accounts (name, type, user_id) VALUES ('forged', 'bank', $1)", [userA]))).rejects.toMatchObject({ code: "42501" })
    await expect(asUser(userB, () => client.query("INSERT INTO transactions (type, amount, category, date, account_id) VALUES ('expense', 100, 'food', '2026-10-07', $1)", [accountA.id]))).rejects.toMatchObject({ code: "42501" })
    await expect(asUser(userB, () => client.query("INSERT INTO transactions (type, amount, category, date, account_id, destination_account_id) VALUES ('transfer', 100, 'transfer', '2026-10-07', $1, $2)", [accountB.id, accountA.id]))).rejects.toMatchObject({ code: "42501" })
  })

  it("isolates watchlist notes while allowing the same ticker for two users", async () => {
    await asUser(userA, () => client.query("INSERT INTO stock_watchlist (symbol, note) VALUES ('BBCA', 'A note')"))
    await asUser(userB, async () => {
      await client.query("INSERT INTO stock_watchlist (symbol, note) VALUES ('BBCA', 'B note')")
      expect((await client.query("SELECT note FROM stock_watchlist")).rows).toEqual([{ note: "B note" }])
    })
  })

  it("does not retain the previous user on a reused connection", async () => {
    await asUser(userA, () => client.query("SELECT * FROM accounts"))
    await asUser(null, async () => {
      expect((await client.query("SELECT * FROM accounts")).rowCount).toBe(0)
    })
    expect((await client.query("SELECT current_user")).rows[0].current_user).toBe("postgres")
  })

  it("detects disabled ownership enforcement during readiness checks", async () => {
    await verifyAuthReadiness(client)
    await client.query("BEGIN; ALTER TABLE accounts DISABLE ROW LEVEL SECURITY")
    try { await expect(verifyAuthReadiness(client)).rejects.toThrow("accounts") }
    finally { await client.query("ROLLBACK") }
  })

  it("keeps ownership mandatory even when a legacy permissive policy exists", async () => {
    await client.query("CREATE POLICY legacy_open ON accounts FOR ALL TO PUBLIC USING (true) WITH CHECK (true)")
    try {
      const result = await asUser(userB, () => client.query("SELECT id FROM accounts"))
      expect(result.rows).toEqual([{ id: accountB.id }])
    } finally { await client.query("DROP POLICY legacy_open ON accounts") }
  })

  it("refuses conflicting legacy watchlist notes before changing ownership", async () => {
    await asUser(userA, () => client.query("INSERT INTO stock_watchlist (symbol, note) VALUES ('BBRI', 'New owner note')"))
    try {
      await expect(assignLegacyOwner(client, "owner@example.test", true)).rejects.toThrow("duplicate notes")
      expect((await client.query("SELECT user_id FROM accounts WHERE id=$1", [legacyId])).rows[0].user_id).toBeNull()
    } finally {
      await asUser(userA, () => client.query("DELETE FROM stock_watchlist WHERE symbol='BBRI'"))
    }
  })

  it("previews and assigns legacy data only to a verified owner", async () => {
    await expect(assignLegacyOwner(client, "missing@example.test", true)).rejects.toThrow("confirmed")
    const preview = await assignLegacyOwner(client, "owner@example.test")
    expect(preview.accounts).toBe(1)
    expect((await client.query("SELECT user_id FROM accounts WHERE id=$1", [legacyId])).rows[0].user_id).toBeNull()
    const applied = await assignLegacyOwner(client, "owner@example.test", true)
    expect(applied).toEqual(preview)
    expect((await client.query("SELECT user_id, initial_balance FROM accounts WHERE id=$1", [legacyId])).rows[0]).toEqual({ user_id: userA, initial_balance: 12345 })
    expect((await assignLegacyOwner(client, "owner@example.test", true)).accounts).toBe(0)
    expect((await client.query("SELECT user_id FROM accounts WHERE id=$1", [accountB.id])).rows[0].user_id).toBe(userB)
  })

  it("groups the entire filtered history and keeps names private under RLS", async () => {
    await asUser(userA, async () => {
      await client.query("SAVEPOINT group_fixture")
      try {
        const connection = drizzle(client)
        const accountId = (await client.query("INSERT INTO accounts(name, type) VALUES ('Group fixture', 'bank') RETURNING id")).rows[0].id
        const targetId = (await client.query("INSERT INTO accounts(name, type) VALUES ('Group target', 'bank') RETURNING id")).rows[0].id
        await client.query("INSERT INTO transactions(type, amount, category, group_name, date, account_id) SELECT 'expense', 100, 'Food', 'Japan trip', '2026-10-09', $1 FROM generate_series(1, 26)", [accountId])
        await client.query("INSERT INTO transactions(type, amount, category, group_name, date, account_id) VALUES ('income', 600, 'Refund', 'Japan trip', '2026-10-09', $1), ('expense', 200, 'Food', null, '2026-10-09', $1), ('expense', 600, 'Food', 'Wedding', '2026-10-09', $1)", [accountId])
        await client.query("INSERT INTO transactions(type, amount, category, group_name, date, account_id, destination_account_id) VALUES ('transfer', 500, 'Transfer', 'Japan trip', '2026-10-09', $1, $2)", [accountId, targetId])
        const page = await readTransactionPage(connection, eq(transactions.accountId, accountId), 1, 2)
        expect(page.items).toHaveLength(2)
        expect(page).toMatchObject({ total: 30, summary: { income: 600, expense: 3400 } })
        expect(page.groups).toEqual([
          { groupName: 'Japan trip', count: 28, income: 600, expense: 2600 },
          { groupName: 'Wedding', count: 1, income: 0, expense: 600 },
          { groupName: null, count: 1, income: 0, expense: 200 },
        ])
        const selected = await readTransactionPage(connection, and(eq(transactions.accountId, accountId), eq(transactions.groupName, 'Japan trip')), 2, 2)
        expect(selected).toMatchObject({ total: 28, summary: { income: 600, expense: 2600 }, groups: [page.groups[0]] })
        expect(selected.items.every((item) => item.groupName === 'Japan trip')).toBe(true)
        expect((await readTransactionPage(connection, and(eq(transactions.accountId, accountId), isNull(transactions.groupName)), 1, 25)).groups)
          .toEqual([{ groupName: null, count: 1, income: 0, expense: 200 }])
        await client.query("SELECT set_config('app.user_id', $1, true)", [userB])
        expect((await connection.selectDistinct({ name: transactions.groupName }).from(transactions).where(isNotNull(transactions.groupName)))).toEqual([])
        expect((await readTransactionPage(connection, undefined, 1, 25)).groups).toEqual([])
        expect((await client.query("UPDATE transactions SET group_name='stolen' WHERE account_id=$1", [accountId])).rowCount).toBe(0)
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT group_fixture")
      }
    })
  })

  it("keeps optimized SQL totals, pagination, prices and joins equivalent under RLS", async () => {
    await asUser(userA, async () => {
      await client.query("SAVEPOINT query_fixture")
      try {
        let queryCount = 0
        const connection = drizzle(client, { logger: { logQuery() { queryCount++ } } })
        async function singleQuery(action) {
          const before = queryCount
          const result = await action()
          expect(queryCount - before).toBe(1)
          return result
        }
        const accountId = (await client.query("INSERT INTO accounts(name, type, initial_balance) VALUES ('Query fixture', 'investment', 10000) RETURNING id")).rows[0].id
        const targetId = (await client.query("INSERT INTO accounts(name, type, initial_balance) VALUES ('Transfer target', 'bank', 1000) RETURNING id")).rows[0].id
        await client.query("INSERT INTO transactions(type, amount, category, date, account_id, destination_account_id) VALUES ('income', 1000, 'Salary', '2026-04-01', $1, null), ('expense', 200, 'Food', '2026-09-02', $1, null), ('expense', 50, 'Food', '2026-10-02', $1, null), ('expense', 70, 'Food', '2026-10-02', $1, null), ('transfer', 500, 'Transfer', '2026-10-03', $1, $2), ('income', 600, 'Salary', '2027-01-01', $1, null)", [accountId, targetId])
        await client.query("INSERT INTO stock_instruments(symbol, name) VALUES ('TEST', 'Fixture')")
        await client.query("INSERT INTO stock_trades(account_id, symbol, side, shares, price, fees, date) VALUES ($1, 'TEST', 'buy', 3.1234, 789.1234, 20, '2026-04-02'), ($1, 'TEST', 'sell', 1.1234, 890.2345, 10, '2026-10-03'), ($1, 'TEST', 'buy', 0.0001, 50, 0, '2026-10-04')", [accountId])
        await client.query("INSERT INTO stock_prices(symbol, price, date) VALUES ('TEST', 800, '2026-09-01'), ('TEST', 900, '2026-10-01')")
        await client.query("INSERT INTO budgets(category, budget, period_start, rollover_enabled) VALUES ('Food', 500, '2026-09-01', true), ('Food', 400, '2026-10-01', true), ('Empty', 100, '2026-10-01', false)")
        const goalId = (await client.query("INSERT INTO goals(title, target_amount, current_amount, target_date) VALUES ('Fixture goal', 1000, 10, '2027-01-01') RETURNING id")).rows[0].id
        await client.query("INSERT INTO goal_contributions(goal_id, account_id, amount, date) VALUES ($1, $2, 50, '2026-10-01'), ($1, $2, 70, '2026-10-02')", [goalId, accountId])
        const fundId = (await client.query("INSERT INTO sinking_funds(name, account_id, target_amount, target_date) VALUES ('Fixture fund', $1, 1000, '2027-01-01') RETURNING id", [accountId])).rows[0].id
        await client.query("INSERT INTO sinking_fund_entries(fund_id, kind, amount, date) VALUES ($1, 'allocate', 200, '2026-10-01'), ($1, 'release', 40, '2026-10-02')", [fundId])
        const debtId = (await client.query("INSERT INTO debts(type, name, amount, due_date) VALUES ('utang', 'Fixture debt', 1000, '2026-10-01') RETURNING id")).rows[0].id
        const transactionId = (await client.query("SELECT id FROM transactions WHERE account_id=$1 AND type='expense' LIMIT 1", [accountId])).rows[0].id
        await client.query("INSERT INTO debt_payments(debt_id, account_id, amount, date, transaction_id) VALUES ($1, $2, 300, '2026-10-01', $3), ($1, $2, 200, '2026-10-02', $3)", [debtId, accountId, transactionId])

        const oldLedger = await readLedger(connection)
        const newLedger = await singleQuery(() => readBalanceLedger(connection))
        expect(newLedger.summaries).toEqual(oldLedger.summaries.toSorted((a, b) => a.id - b.id))
        expect(newLedger.cashBalance).toBe(oldLedger.cashBalance)
        for (const id of [accountId, targetId]) {
          const expected = oldLedger.summaries.filter((row) => row.id === id)
          expect((await readLedger(connection, [id])).summaries).toEqual(expected)
          expect(await accountSummaryQuery(connection, [id])).toEqual(expected)
        }
        expect((await readReservedCash(connection)).reserved).toEqual((await readReservations(connection)).reserved)
        expect((await readReservedCash(connection, [accountId])).reserved).toEqual((await readReservations(connection, [accountId])).reserved)
        expect((await readReservations(connection, [targetId])).entries).toEqual([])
        expect((await goalSummaryQuery(connection)).find((row) => row.id === goalId).currentAmount).toBe(130)
        expect((await debtSummaryQuery(connection)).find((row) => row.id === debtId)).toMatchObject({ paidAmount: 500, remaining: 500 })
        const budgetRows = await singleQuery(() => readBudgets(connection, '2026-10-01', '2026-11-01', '2026-09-01'))
        expect(budgetRows.find((row) => row.category === 'Food')).toMatchObject({ spent: 120, carryover: 300, effectiveBudget: 700 })
        expect(budgetRows.find((row) => row.category === 'Empty')).toMatchObject({ spent: 0, carryover: 0 })

        const dashboard = await singleQuery(() => readDashboardLedger(connection, { historyStart: '2026-05-01', historyEnd: '2026-11-01', previousStart: '2026-09-01', periodEnd: '2026-11-01', recentStart: '2026-10-01', today: '2026-10-07' }))
        expect(dashboard.cashBalance).toBe(oldLedger.cashBalance)
        expect(dashboard.transactions.find((row) => row.date === '2026-10-02')).toMatchObject({ amount: 120 })
        expect(dashboard.transactions.some((row) => row.date === '2027-01-01')).toBe(false)
        expect(dashboard.openingChange).toBe(1000 + tradeCashChange(oldLedger.trades.find((trade) => trade.date === '2026-04-02')))
        expect(await singleQuery(() => readLatestPrices(connection, ['TEST', 'BBCA', 'TEST']))).toMatchObject([{ symbol: 'TEST', price: 900, date: '2026-10-01' }])
        expect(await readLatestPrices(connection, [])).toEqual([])
        const page = await singleQuery(() => readTransactionPage(connection, eq(transactions.accountId, accountId), 100, 2))
        expect(page).toMatchObject({ page: 3, total: 6, totalPages: 3, limit: 2, summary: { income: 1600, expense: 320 } })
        expect(page.items).toHaveLength(2)
        expect(page.items[0]).toMatchObject({ category: 'Food', date: '2026-09-02', accountId })
        const expectedPage = oldLedger.transactions
          .filter((row) => row.accountId === accountId)
          .toSorted((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
          .slice(4, 6)
        expect(page.items).toEqual(JSON.parse(JSON.stringify(expectedPage)))
        expect(await readTransactionPage(connection, eq(transactions.accountId, -1), 2, 25)).toMatchObject({ items: [], page: 1, total: 0, totalPages: 1 })

        await client.query("SELECT set_config('app.user_id', $1, true)", [userB])
        expect((await readLedger(connection, [accountId])).summaries).toEqual([])
        expect(await accountSummaryQuery(connection, [accountId])).toEqual([])
        expect((await readReservations(connection, [accountId])).reserved.size).toBe(0)
        expect((await readReservedCash(connection, [accountId])).reserved.size).toBe(0)
        expect((await readBalanceLedger(connection)).summaries.map((row) => row.id)).toEqual([accountB.id])
        expect(await readBudgets(connection, '2026-10-01', '2026-11-01', '2026-09-01')).toEqual([])
        expect(await goalSummaryQuery(connection)).toEqual([])
        expect(await debtSummaryQuery(connection)).toEqual([])
        expect((await readTransactionPage(connection, undefined, 1, 25)).total).toBe(0)
        expect((await readDashboardLedger(connection, { historyStart: '2026-05-01', historyEnd: '2026-11-01', previousStart: '2026-09-01', periodEnd: '2026-11-01', recentStart: '2026-10-01', today: '2026-10-07' })).cashBalance).toBe(0)
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT query_fixture")
      }
    })
  })
})
