ALTER TABLE "accounts" ALTER COLUMN "initial_balance" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "budget" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "spent" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "debt_payments" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "goal_contributions" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "target_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "current_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "recurring_transactions" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "sinking_fund_entries" ALTER COLUMN "amount" SET DATA TYPE numeric(21, 2);--> statement-breakpoint
ALTER TABLE "sinking_funds" ALTER COLUMN "target_amount" SET DATA TYPE numeric(21, 2);--> statement-breakpoint
ALTER TABLE "stock_trades" ALTER COLUMN "fees" SET DATA TYPE numeric(21, 2);