ALTER TABLE "asset_rates" DROP CONSTRAINT "asset_rates_symbol_check";--> statement-breakpoint
ALTER TABLE "valued_accounts" DROP CONSTRAINT "valued_accounts_symbol_check";--> statement-breakpoint
ALTER TABLE "asset_rates" ADD CONSTRAINT "asset_rates_symbol_check" CHECK ("asset_rates"."symbol" in ('XAU','USD','SGD','EUR','JPY','MYR','SAR','THB'));--> statement-breakpoint
ALTER TABLE "valued_accounts" ADD CONSTRAINT "valued_accounts_symbol_check" CHECK ("valued_accounts"."symbol" in ('XAU','USD','SGD','EUR','JPY','MYR','SAR','THB'));