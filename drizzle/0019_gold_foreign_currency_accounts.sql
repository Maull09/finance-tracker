CREATE TABLE "asset_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"idr_rate" numeric(20, 8) NOT NULL,
	"date" date NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"oldest_input_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_rates_symbol_check" CHECK ("asset_rates"."symbol" in ('XAU','USD','SGD','EUR','JPY','MYR','SAR')),
	CONSTRAINT "asset_rates_positive_check" CHECK ("asset_rates"."idr_rate" > 0 and "asset_rates"."idr_rate" <= 100000000)
);
--> statement-breakpoint
ALTER TABLE "asset_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "valued_account_balances" (
	"user_id" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"quantity" numeric(16, 6) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valued_balances_quantity_check" CHECK ("valued_account_balances"."quantity" >= 0 and "valued_account_balances"."quantity" <= 1000000)
);
--> statement-breakpoint
ALTER TABLE "valued_account_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "valued_accounts" (
	"user_id" uuid DEFAULT nullif(current_setting('app.user_id', true), '')::uuid NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valued_accounts_symbol_check" CHECK ("valued_accounts"."symbol" in ('XAU','USD','SGD','EUR','JPY','MYR','SAR'))
);
--> statement-breakpoint
ALTER TABLE "valued_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "valued_account_balances" ADD CONSTRAINT "valued_account_balances_account_id_valued_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."valued_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_rates_symbol_date_idx" ON "asset_rates" USING btree ("symbol","date");--> statement-breakpoint
CREATE INDEX "valued_balances_user_account_date_idx" ON "valued_account_balances" USING btree ("user_id","account_id","date" desc,"id" desc);--> statement-breakpoint
CREATE INDEX "valued_accounts_user_id_idx" ON "valued_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "market_read" ON "asset_rates" AS PERMISSIVE FOR SELECT TO "finance_user" USING (true);--> statement-breakpoint
CREATE POLICY "market_insert" ON "asset_rates" AS PERMISSIVE FOR INSERT TO "finance_user" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "market_update" ON "asset_rates" AS PERMISSIVE FOR UPDATE TO "finance_user" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "app_access" ON "valued_account_balances" AS PERMISSIVE FOR ALL TO "finance_user" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "valued_account_balances" AS RESTRICTIVE FOR ALL TO "finance_user" USING (valued_account_balances.user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (valued_account_balances.user_id = nullif(current_setting('app.user_id', true), '')::uuid and (valued_account_balances.account_id is null or exists (select 1 from public.valued_accounts where valued_accounts.id = valued_account_balances.account_id)));--> statement-breakpoint
CREATE POLICY "app_access" ON "valued_accounts" AS PERMISSIVE FOR ALL TO "finance_user" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "valued_accounts" AS RESTRICTIVE FOR ALL TO "finance_user" USING (valued_accounts.user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (valued_accounts.user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON public.valued_accounts, public.valued_account_balances, public.asset_rates FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.valued_accounts, public.valued_account_balances TO finance_user;
GRANT SELECT, INSERT, UPDATE ON public.asset_rates TO finance_user;
REVOKE ALL ON SEQUENCE public.valued_accounts_id_seq, public.valued_account_balances_id_seq, public.asset_rates_id_seq FROM PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE public.valued_accounts_id_seq, public.valued_account_balances_id_seq, public.asset_rates_id_seq TO finance_user;
--> statement-breakpoint
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON public.valued_accounts, public.valued_account_balances, public.asset_rates FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON SEQUENCE public.valued_accounts_id_seq, public.valued_account_balances_id_seq, public.asset_rates_id_seq FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invalidate_api_cache AFTER INSERT OR UPDATE OR DELETE ON public.valued_accounts FOR EACH ROW EXECUTE FUNCTION public.invalidate_private_api_cache();
CREATE TRIGGER invalidate_api_cache_truncate AFTER TRUNCATE ON public.valued_accounts FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_market_api_cache();
CREATE TRIGGER invalidate_api_cache AFTER INSERT OR UPDATE OR DELETE ON public.valued_account_balances FOR EACH ROW EXECUTE FUNCTION public.invalidate_private_api_cache();
CREATE TRIGGER invalidate_api_cache_truncate AFTER TRUNCATE ON public.valued_account_balances FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_market_api_cache();
CREATE TRIGGER invalidate_api_cache AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.asset_rates FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_market_api_cache();
