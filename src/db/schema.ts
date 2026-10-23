import {
  ownerPolicy,
  financeUser,
  privateAccessPolicy,
  marketReadPolicy,
  marketInsertPolicy,
  marketUpdatePolicy,
} from "./ownership"
// src/db/schema.ts
import {
  pgTable,
  pgPolicy,
  uuid,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  pgEnum,
  bigint,
  numeric,
  uniqueIndex,
  index,
  check,
  jsonb,
} from "drizzle-orm/pg-core"
import { desc, sql } from "drizzle-orm"
import type { AiDraftInput } from "@/lib/ai/validation"

export const aiConversations = pgTable("ai_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().default(sql`nullif(current_setting('app.user_id', true), '')::uuid`),
  title: text("title").notNull(),
  busyUntil: timestamp("busy_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  privateAccessPolicy(), ownerPolicy("ai_conversations"),
  index("ai_conversations_user_created_idx").on(table.userId, desc(table.createdAt)),
]).enableRLS()

export const aiMessages = pgTable("ai_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().default(sql`nullif(current_setting('app.user_id', true), '')::uuid`),
  conversationId: uuid("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  privateAccessPolicy(), ownerPolicy("ai_messages", [["conversation_id", "ai_conversations"]]),
  index("ai_messages_conversation_created_idx").on(table.conversationId, table.createdAt, table.id),
  index("ai_messages_user_created_idx").on(table.userId, table.createdAt),
  check("ai_messages_valid_role", sql`${table.role} in ('user', 'assistant')`),
]).enableRLS()

export const aiReceipts = pgTable("ai_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().default(sql`nullif(current_setting('app.user_id', true), '')::uuid`),
  conversationId: uuid("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  privateAccessPolicy(), ownerPolicy("ai_receipts", [["conversation_id", "ai_conversations"]]),
  index("ai_receipts_conversation_idx").on(table.conversationId),
  uniqueIndex("ai_receipts_storage_path_idx").on(table.storagePath),
]).enableRLS()

export const aiDrafts = pgTable("ai_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().default(sql`nullif(current_setting('app.user_id', true), '')::uuid`),
  conversationId: uuid("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").notNull().references(() => aiMessages.id),
  receiptId: uuid("receipt_id").references(() => aiReceipts.id),
  data: jsonb("data").$type<AiDraftInput>().notNull(),
  status: text("status").notNull().default("pending"),
  transactionId: integer("transaction_id").references(() => transactions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  privateAccessPolicy(), ownerPolicy("ai_drafts", [
    ["conversation_id", "ai_conversations"], ["message_id", "ai_messages"],
    ["receipt_id", "ai_receipts"], ["transaction_id", "transactions"],
  ]),
  index("ai_drafts_conversation_idx").on(table.conversationId),
  check("ai_drafts_valid_status", sql`${table.status} in ('pending', 'confirmed', 'rejected')`),
  check("ai_drafts_confirmation_link", sql`(${table.status} = 'confirmed') = (${table.transactionId} is not null)`),
]).enableRLS()

export const apiCacheRevisions = pgTable(
  "api_cache_revisions",
  {
    scope: text("scope").primaryKey(),
    revision: uuid("revision").notNull().defaultRandom(),
  },
  () => [
    pgPolicy("cache_read", {
      for: "select",
      to: financeUser,
      using: sql`scope = 'market' or scope = nullif(current_setting('app.user_id', true), '')`,
    }),
  ],
).enableRLS()

export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
])
export const budgetPeriodEnum = pgEnum("budget_period", ["monthly", "yearly"])

export const accountTypeEnum = pgEnum("account_type", [
  "cash",
  "bank",
  "investment",
  "ewallet",
  "other",
])

export const debtStatusEnum = pgEnum("debt_status", ["unpaid", "paid"])
export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "weekly",
  "monthly",
])

export const debts = pgTable(
  "debts",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    type: text("type").notNull(), // "utang" | "piutang"
    name: text("name").notNull(),
    amount: integer("amount").notNull(),
    description: text("description"),
    status: debtStatusEnum("status").notNull().default("unpaid"),
    dueDate: date("due_date"),
    paidDate: date("paid_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("debts", []),
    index("debts_user_id_idx").on(table.userId),
    index("debts_user_due_date_idx").on(table.userId, table.dueDate),
  ],
).enableRLS()

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    initialBalance: integer("initial_balance").notNull().default(0),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("accounts", []),
    index("accounts_user_id_idx").on(table.userId),
    index("accounts_user_order_idx").on(table.userId, table.id),
  ],
).enableRLS()

export const transactions = pgTable(
  "transactions",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    type: transactionTypeEnum("type").notNull(),
    amount: integer("amount").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    groupName: text("group_name"),
    description: text("description"),
    date: date("date").notNull(),
    accountId: integer("account_id")
      .references(() => accounts.id)
      .notNull(),
    destinationAccountId: integer("destination_account_id").references(
      () => accounts.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("transactions", [
      ["account_id", "accounts"],
      ["destination_account_id", "accounts"],
    ]),
    index("transactions_user_id_idx").on(table.userId),
    check(
      "transactions_valid_group_name",
      sql`${table.groupName} is null or (${table.groupName} = btrim(${table.groupName}) and char_length(${table.groupName}) between 1 and 100)`,
    ),
    index("transactions_user_date_id_idx").on(
      table.userId,
      desc(table.date),
      desc(table.id),
    ),
    index("transactions_user_type_date_idx").on(table.userId, table.type, table.date),
    index("transactions_user_account_date_idx").on(table.userId, table.accountId, table.date),
    index("transactions_user_destination_date_idx").on(table.userId, table.destinationAccountId, table.date),
  ],
).enableRLS()

export const budgets = pgTable(
  "budgets",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    category: text("category").notNull(),
    budget: integer("budget").notNull(),
    spent: integer("spent").notNull().default(0),
    period: budgetPeriodEnum("period").notNull().default("monthly"),
    periodStart: date("period_start").notNull(),
    rolloverEnabled: boolean("rollover_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("budgets", []),
    index("budgets_user_id_idx").on(table.userId),
    index("budgets_user_period_category_idx").on(
      table.userId,
      table.periodStart,
      table.category,
    ),
  ],
).enableRLS()

export const recurringTransactions = pgTable(
  "recurring_transactions",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: transactionTypeEnum("type").notNull(),
    amount: integer("amount").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    description: text("description"),
    accountId: integer("account_id")
      .references(() => accounts.id)
      .notNull(),
    destinationAccountId: integer("destination_account_id").references(
      () => accounts.id,
    ),
    frequency: recurringFrequencyEnum("frequency").notNull().default("monthly"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    lastExecutedDate: date("last_executed_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("recurring_transactions", [
      ["account_id", "accounts"],
      ["destination_account_id", "accounts"],
    ]),
    index("recurring_transactions_user_id_idx").on(table.userId),
    index("recurring_user_start_date_idx").on(table.userId, table.startDate),
    index("recurring_user_account_idx").on(table.userId, table.accountId),
    index("recurring_user_destination_idx").on(table.userId, table.destinationAccountId),
  ],
).enableRLS()

export const goalContributions = pgTable(
  "goal_contributions",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    goalId: integer("goal_id")
      .references(() => goals.id)
      .notNull(),
    accountId: integer("account_id")
      .references(() => accounts.id)
      .notNull(),
    amount: integer("amount").notNull(),
    date: date("date").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("goal_contributions", [
      ["goal_id", "goals"],
      ["account_id", "accounts"],
    ]),
    index("goal_contributions_user_id_idx").on(table.userId),
    index("goal_contributions_user_goal_date_idx").on(table.userId, table.goalId, table.date, table.id),
    index("goal_contributions_user_account_idx").on(table.userId, table.accountId),
  ],
).enableRLS()

export const debtPayments = pgTable(
  "debt_payments",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    debtId: integer("debt_id")
      .references(() => debts.id)
      .notNull(),
    accountId: integer("account_id")
      .references(() => accounts.id)
      .notNull(),
    amount: integer("amount").notNull(),
    date: date("date").notNull(),
    note: text("note"),
    transactionId: integer("transaction_id")
      .references(() => transactions.id)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("debt_payments", [
      ["debt_id", "debts"],
      ["account_id", "accounts"],
      ["transaction_id", "transactions"],
    ]),
    index("debt_payments_user_id_idx").on(table.userId),
    index("debt_payments_user_debt_date_idx").on(table.userId, table.debtId, table.date, table.id),
    index("debt_payments_user_account_idx").on(table.userId, table.accountId),
  ],
).enableRLS()

export const reconciliations = pgTable(
  "reconciliations",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .references(() => accounts.id)
      .notNull(),
    actualBalance: integer("actual_balance").notNull(),
    date: date("date").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("reconciliations", [["account_id", "accounts"]]),
    index("reconciliations_user_id_idx").on(table.userId),
    index("reconciliations_user_account_date_idx").on(table.userId, table.accountId, desc(table.date)),
  ],
).enableRLS()

export const goals = pgTable(
  "goals",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    targetAmount: integer("target_amount").notNull(),
    currentAmount: integer("current_amount").notNull().default(0),
    targetDate: date("target_date").notNull(),
    category: text("category").notNull().default("other"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("goals", []),
    index("goals_user_id_idx").on(table.userId),
    index("goals_user_order_idx").on(table.userId, table.id),
  ],
).enableRLS()

export const stockInstruments = pgTable(
  "stock_instruments",
  {
    symbol: text("symbol").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [marketReadPolicy(), marketInsertPolicy()],
).enableRLS()

export const stockTrades = pgTable(
  "stock_trades",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => stockInstruments.symbol),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    side: text("side").notNull(),
    shares: numeric("shares", {
      precision: 16,
      scale: 4,
      mode: "number",
    }).notNull(),
    price: numeric("price", {
      precision: 16,
      scale: 4,
      mode: "number",
    }).notNull(),
    fees: bigint("fees", { mode: "number" }).notNull().default(0),
    date: date("date").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("stock_trades", [["account_id", "accounts"]]),
    index("stock_trades_user_id_idx").on(table.userId),
    index("stock_trades_user_account_date_idx").on(table.userId, table.accountId, desc(table.date), desc(table.id)),

    index("stock_trades_account_symbol_date_idx").on(
      table.accountId,
      table.symbol,
      table.date,
    ),
    check("stock_trades_valid_side", sql`${table.side} in ('buy', 'sell')`),
    check(
      "stock_trades_positive_shares",
      sql`${table.shares} > 0 and ${table.shares} <= 10000000`,
    ),
    check(
      "stock_trades_valid_money",
      sql`${table.price} > 0 and ${table.fees} >= 0`,
    ),
  ],
).enableRLS()

export const stockPrices = pgTable(
  "stock_prices",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol")
      .notNull()
      .references(() => stockInstruments.symbol),
    price: bigint("price", { mode: "number" }).notNull(),
    date: date("date").notNull(),
    source: text("source").notNull().default("Yahoo Finance"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    marketReadPolicy(),
    marketInsertPolicy(),
    marketUpdatePolicy(),

    uniqueIndex("stock_prices_symbol_date_idx").on(table.symbol, table.date),
    check("stock_prices_positive_price", sql`${table.price} > 0`),
  ],
).enableRLS()

export const stockWatchlist = pgTable(
  "stock_watchlist",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    symbol: text("symbol")
      .notNull()
      .references(() => stockInstruments.symbol),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("stock_watchlist", []),
    index("stock_watchlist_user_id_idx").on(table.userId),
    uniqueIndex("stock_watchlist_user_symbol_idx").on(
      table.userId,
      table.symbol,
    ),
  ],
).enableRLS()

export const sinkingFunds = pgTable(
  "sinking_funds",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    targetAmount: bigint("target_amount", { mode: "number" }).notNull(),
    targetDate: date("target_date").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("sinking_funds", [["account_id", "accounts"]]),
    index("sinking_funds_user_id_idx").on(table.userId),
    index("sinking_funds_user_target_date_idx").on(table.userId, table.targetDate),
    index("sinking_funds_user_account_idx").on(table.userId, table.accountId),

    check("sinking_funds_positive_target", sql`${table.targetAmount} > 0`),
  ],
).enableRLS()

export const sinkingFundEntries = pgTable(
  "sinking_fund_entries",
  {
    userId: uuid("user_id").default(
      sql`nullif(current_setting('app.user_id', true), '')::uuid`,
    ),
    id: serial("id").primaryKey(),
    fundId: integer("fund_id")
      .notNull()
      .references(() => sinkingFunds.id),
    kind: text("kind").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    date: date("date").notNull(),
    note: text("note").notNull().default(""),
    transactionId: integer("transaction_id").references(() => transactions.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    privateAccessPolicy(),
    ownerPolicy("sinking_fund_entries", [
      ["fund_id", "sinking_funds"],
      ["transaction_id", "transactions"],
    ]),
    index("sinking_fund_entries_user_id_idx").on(table.userId),
    index("sinking_fund_entries_user_fund_order_idx").on(table.userId, table.fundId, desc(table.id)),

    index("sinking_fund_entries_fund_idx").on(table.fundId),
    uniqueIndex("sinking_fund_entries_transaction_idx").on(table.transactionId),
    check(
      "sinking_fund_entries_valid_kind",
      sql`${table.kind} in ('allocate', 'release', 'spend')`,
    ),
    check("sinking_fund_entries_positive_amount", sql`${table.amount} > 0`),
    check(
      "sinking_fund_entries_linked_spend",
      sql`(${table.kind} = 'spend') = (${table.transactionId} is not null)`,
    ),
  ],
).enableRLS()
