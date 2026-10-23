# Investments and financial planning

The investment, net-worth, simulation, calendar, and sinking-fund views share the existing cash ledger. The interface is available in English and Indonesian; all amounts remain in IDR.

## Apply the database migration

1. Back up the intended Supabase database and stop the app while updating its schema.
2. Use the Supabase Direct connection URL or Session pooler (port 5432) in `DATABASE_URL` temporarily.
3. Run `npm run db:migrate` to apply pending migrations, including `0003_wild_ultimo.sql`, `0004_clumsy_jane_foster.sql`, and `0005_concerned_ego.sql`.
4. Run `npm run db:migrate -- --check`, restore the runtime pooler URL, and restart the app.

Existing tables with empty migration history need explicit, verified legacy adoption rather than replaying the initial migration. See the [database migration and recovery guide](database-migrations.md).

Migration 0003 adds six tables: instruments, trades, prices, watchlist entries, sinking funds, and fund entries. It does not reinterpret existing balances or insert sample financial records. Migration generation is not database migration. Without these tables, the ledger queries, including the dashboard's cash balance, will fail.

Migration 0004 removes the whole-lot restriction and converts trade quantities/prices to fixed-precision PostgreSQL numeric columns without changing their existing values. Apply it before recording decimal trades.

Migration 0005 widens trade prices from two to four decimal places without changing existing values or reducing integer capacity. Apply it before entering four-decimal prices; otherwise PostgreSQL can round stored prices to the old two-decimal scale.

Review legacy investment accounts before recording stock trades. Their opening balance must represent cash, not holdings. Do not leave a previous portfolio valuation in opening cash and then record the same holdings again. Enter actual trade history and the cash funding that existed before those purchases; backdated buys are checked against cash and earlier holdings. Back up and reconcile existing data before making manual corrections.

## Stock portfolios and watchlists

- Create an **Investment** account for brokerage cash. Record transfers into it using Transactions.
- Record actual buys and sells in Investments. These records do not send orders to a broker.
- Use a four-letter IDX ticker, a trade date no later than today, lots, price per share, and total fees/taxes. One lot represents 100 shares. Lots allow up to six decimal places; shares and prices allow four. For example, 1.25 lots equals 125 shares, and 0.012345 lots equals 1.2345 shares. The minimum per-share price is 0.0001 IDR; more than four significant decimal places are rejected.
- Decimal quantities are bookkeeping inputs, not a guarantee that a broker or exchange can execute them. Fees remain whole-rupiah inputs. The table localizes decimal separators and calculates average cost from trades and fees; it is not an independently editable balance.
- Positions are calculated separately for each account and ticker, in date order. Same-day trades use record order.
- Trade gross values are rounded half-up to 0.01 IDR after multiplying the full four-decimal quantity and price, using scaled integer arithmetic; trades whose gross rounds to zero are rejected. Weighted-average cost includes buy fees. A partial sale releases proportional cost basis rounded to 0.01 IDR rather than whole rupiah; the final sale releases the remaining basis exactly. Sale fees reduce proceeds. Average cost is computed from the remaining cost basis and displayed with exactly four decimal places. Recorded, market, and watchlist per-share prices also display four decimal places, including trailing zeros; cash totals retain two-decimal precision. Daily provider prices remain whole-rupiah values, displayed with four trailing zeros rather than fabricated precision.
- Buying reduces brokerage cash; selling increases it. Neither creates an ordinary consumption expense or income record, so the same trade must not also be entered in Transactions.
- Sales exceeding holdings, cash-short purchases, and purchases using money already allocated to goals/funds are rejected. Editing or removing a trade is rejected when it would invalidate subsequent holdings, dated cash history, or current allocations.
- Open **Manage trades** or **Trade history** to edit/delete an individual trade. Edit forms show the previous/new cash impact and estimated available cash in the selected account after saving. Changing the account validates both affected accounts; changing the ticker or date cannot orphan later sales. Existing record IDs remain the ordering tie-breaker for same-day trades. Changes are atomic; failures leave the original trade intact and retain form input.
- Brokerage accounts can be edited from the investment cash section. Opening balance remains cash before the first transaction, not the current calculated balance. Accounts with trades cannot change away from the investment type; linked accounts cannot be deleted.
- Add a stock to the Watchlist to follow its daily close without owning it. Edit its company name and note; the company name is shared with portfolio instruments, while the ticker stays fixed. Duplicate entries are rejected without overwriting the existing note/name. Removing a watchlist entry leaves trade history and prices intact.

Stock splits, dividends, rights issues, short selling, non-IDR securities, and corporate-action adjustments are not automatically handled. Returns are rupiah gains/losses, not annualized or time-weighted performance. Do not treat the portfolio as an execution system or investment recommendation.

## Configure daily prices

Daily closes now use Yahoo Finance through the server-side [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2) library. IDX tickers map to `.JK`, for example [`BNBR.JK`](https://finance.yahoo.com/quote/BNBR.JK/). No market-data API key is needed. This is an unofficial integration, not a Yahoo-supported developer API; availability and compatibility are not guaranteed. Review [Yahoo's terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html) and relevant data-use rights before public/commercial deployment or redistribution. Personal deployment does not automatically grant unrestricted data rights.

Install updated dependencies and restart the application. `TWELVE_DATA_API_KEY` is no longer used; old prices and financial records are not deleted, and the provider switch needs no database migration. For scheduled updates only, set this server-only environment variable:

```env
CRON_SECRET=your_generated_long_random_secret
```

Do not use a `NEXT_PUBLIC_` prefix or commit real keys. Restart the local server after changing `.env`; add the same variables to the deployment environment.

The server requests a 30-day window of daily chart bars for active holdings and watchlist tickers. It validates the `.JK` ticker, Jakarta exchange/timezone, equity type, IDR currency, daily interval, quote timestamps, and positive whole-rupiah close. It uses `close`, not adjusted close or the current market-price field. The newest non-null completed close is saved with its actual Asia/Jakarta date. Today's bar is excluded until 15 minutes after Yahoo's reported regular session end; missing/invalid same-day session metadata also excludes it. This buffer avoids treating an intraday/delayed bar as a completed close but does not certify exchange-final data. Weekends and holidays can legitimately retain an earlier price date.

Prices update in three ways:

- Opening Investments automatically makes one refresh request after records load; no API key is required.
- **Update daily prices** requests a refresh on demand.
- On Vercel, `vercel.json` schedules `/api/jobs/stock-prices` at `30 13 * * *`: daily at 13:30 UTC / 20:30 Asia/Jakarta. The job requires `Authorization: Bearer <CRON_SECRET>`. Configure the deployment secret before enabling the job. On another host, configure your own scheduler to call that endpoint with the authorization header.

A successful Yahoo fetch is cached for 15 minutes. Recently saved quotes from the previous provider do not skip the first Yahoo fetch. Requests are sequential, stop on access/rate-limit errors, and stop starting new provider calls after a 40-second processing window. Each chart request has a 15-second abort signal; the routes request a 60-second hosting limit. Responses distinguish updated, cached, failed, and pending tickers. Retry pending tickers after limits recover or the previous request finishes; large watchlists may require multiple runs and sufficient hosting time. Yahoo does not guarantee this access or a fixed request quota.

The UI shows the **actual price date and source**, not the fetch date. Holidays, delayed data, network errors, access rejection, and rate limits can leave older closes visible. Failed updates never overwrite a saved price with zero or a fabricated value. Provider failures have separate recovery messages from database failures; neither exposes raw responses or credentials. Existing quotes keep their original source, including Twelve Data, unless that ticker/date is successfully refreshed. Daily scheduling is not a guarantee of same-day confirmed data. Verify provider access in your deployment environment; successful local access does not guarantee access from a hosting platform.

## Net worth

Net worth adds all account cash, stock market values, and remaining receivables, then subtracts remaining debts. Allocated goal/fund money is already inside cash, not an extra asset. The cash chart includes trade cash flows; it is not an investment-return chart.

If an active holding has no price, full net worth and portfolio market-value totals remain incomplete. A clearly labeled **Known subtotal** includes only valued stocks and the other known components. Recorded purchase cost is not substituted for market value. A saved older price counts as valued, but its date remains visible in Investments.

Debt and receivable amounts assume their outstanding principal was already represented appropriately in your original cash records. Creating an obligation does not by itself invent a cash disbursement or receipt.

## Read-only expense calculator

Choose a projection end date up to two years ahead. The calculator shows and starts from current recorded cash, then includes remaining recurring income and expenses from the financial calendar, such as a scheduled salary or rent. Add up to 20 dated, one-off planned incomes and expenses combined to test several changes at once. The result separates current cash, scheduled income, added income, scheduled expenses, added expenses, and projected cash, with a monthly table and negative-balance warnings.

Transfers do not change total cash. Already-executed occurrences and schedules outside their start/end dates are excluded. The calculator creates no transactions, trades, schedules, or fund entries. Changing inputs or financial data invalidates the previous result.

Debt/receivable deadlines and sinking-fund targets shown in the calendar remain excluded from the calculation: a deadline can overlap with a recurring payment, and a fund target does not itself move cash. Add a separate planned expense only when you want to model its cash impact. Dividends, future trades, interest, inflation, and market-price changes are not forecast automatically. Month-end warnings do not detect every possible intramonth cash shortage. Existing records form the current balance, including any future-dated records entered by the user.

## Financial calendar

Browse a month, select a date on desktop/tablet, or use the agenda on mobile. The calendar combines unrecorded recurring occurrences, remaining debt/receivable deadlines, and sinking-fund targets. **Manage** opens the corresponding feature. **Record now** beside a recurring event opens a confirmation for that specific scheduled occurrence. Choose the actual date the money moved (today or a past date), including before the scheduled date or after the schedule has ended. Planning uses the same confirmation and also lets you choose the scheduled occurrence date.

Saving creates one transaction dated on the actual date, affecting account balances and that date's reports. Only the selected occurrence is completed, so recording one period early or late does not hide other unpaid periods. Repeated or concurrent requests cannot create a second transaction for the same schedule/date. Recorded occurrences are excluded from calendar, projections, and their AI summaries. Deleting a newly linked transaction makes its occurrence pending again; deleting a schedule retains its transactions. The migration preserves the prior completion cutoff for existing schedules without guessing which old transactions belong to individual periods.

Calendar reminders are planned dates, not proof of payment. A debt deadline can overlap with its recurring installment, and a fund target is a reminder rather than an automatic expense. Do not sum calendar entries as a deduplicated cash-flow forecast. Debt/receivable payments and fund spending remain explicit actions in their respective features.

## Sinking funds

Create a fund with an account, target amount/date, and description. This earmarks money for a predictable expense; it is not a separate bank account or an emergency fund.

- **Allocate** reserves available cash without reducing account balance or creating an expense. Existing account-linked goal contributions and fund allocations reduce unallocated cash.
- **Release allocation** makes earmarked cash available again without creating income.
- **Spend from fund** creates one expense from the source account today and a linked fund-history entry in the same database transaction. Choose the real expense category; budget/report totals include it once. Do not record it again in Transactions.

Allocations cannot exceed available cash or the target; spending/releases cannot exceed the fund allocation. Suggested monthly saving divides the remaining target across calendar months through the deadline, including the current month; it is a suggestion, not an automatic transfer.

Funds can be edited, but their account is locked after history exists, and the target cannot fall below the current allocation. Only funds without history can be deleted. History entries are immutable in this version; linked expenses cannot be edited/deleted independently. Release unused money while retaining history. There is no fund-expense reversal workflow yet.

Reservations are bookkeeping labels, not a bank lock. Other ordinary expenses/manual balance edits can still consume earmarked cash and produce negative unallocated cash. Legacy manual goal amounts without an account link cannot be assigned to a source account automatically.

## Verification scope

Run `npm test`, `npx tsc --noEmit`, and `npm run build`. Automated tests cover fees, weighted-average sales, missing prices, schedule expansion, simulations, fund math, strict input validation, provider-payload validation, bilingual messages, and sanitized client errors.

Isolated in-memory PostgreSQL checks exercised actual API handlers for buys/sales, oversell/backdate rollback, dependent-trade deletion, cash/valuation consistency, reservations, linked fund spending, empty-fund editing/deletion, calendar aggregation, simulation non-mutation, invalid requests, and the cron guard. A subsequent six-migration check verified four-decimal price persistence, unchanged legacy values across all 15 tables, edit/rejection behavior, and cent-precision cash accounting. These were not Supabase production migrations or concurrency/load tests.

The application currently has no authentication or per-user isolation. Keep it private; the cron secret protects the scheduled endpoint only, not the rest of the application. Local Yahoo reads for BNBR/BBCA and an application BNBR quote refresh were verified on 2026-10-04 without altering the financial ledger. Provider access and scheduling on the deployment host still need environment-specific verification.
