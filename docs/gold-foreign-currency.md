# Gold and foreign-currency balances

Apply migration `0019_gold_foreign_currency_accounts` with the backed-up workflow in [database migrations](database-migrations.md) before serving this feature. No new dependency, API key or environment setting is required. The server needs outbound HTTPS access to `open.er-api.com` and `api.gold-api.com`.

## Quantities and prices

Accounts → Gold and foreign currency records original holdings: pure-gold grams (up to six decimals), USD, SGD, EUR, MYR and SAR (up to two decimals), or whole JPY. Comma/dot decimal input is accepted without thousands grouping. Quantities must be non-negative and are capped at 10,000 grams or 1,000,000 currency units. The asset symbol is immutable after creation; create a separate account for another currency.

Each save appends a dated quantity snapshot, including multiple corrections on the same day. The latest date and then latest snapshot ID determine the balance. No IDR transaction, income, expense or transfer is synthesized. Deleting a native account explicitly deletes its quantity history after confirmation.

FX uses [ExchangeRate-API's open endpoint](https://www.exchangerate-api.com/docs/free), `https://open.er-api.com/v6/latest/USD`. One response supplies all supported references. IDR per currency unit is `rates.IDR / rates[currency]`. The server respects the response's next-update time; this source updates once per day. The visible “Rates By Exchange Rate API” attribution link must remain wherever these references are used.

Gold uses [Gold API's spot-price endpoint](https://gold-api.com/faqs), `https://api.gold-api.com/price/XAU`, denominated in USD per troy ounce. Convert to IDR per gram using `goldUSD * usdIDR / 31.1034768`. The troy-ounce conversion follows [NIST's unit tables](https://www.nist.gov/system/files/documents/2025/12/23/2026_NIST_HB133_AppendixE-20251222.pdf). Gold references are cached for 15 minutes, bounded by the FX reference expiry. They are market estimates, not Antam buyback or executable bank rates.

The dashboard checks prices on entry, every 15 minutes while visible, after balance changes, and when returning to the browser tab. A manual refresh is also available. Requests require authentication and use fixed upstream URLs; browser-supplied rates are never accepted. Provider responses must have valid units, finite positive values and plausible source timestamps. An older response cannot replace a newer same-day quote.

## Totals and history

Quantities are stored with six-decimal capacity and reference rates with eight. Valuations use fixed-point multiplication and round to IDR cents. Native amounts remain unchanged when prices move. Gold and FX values enter net worth and financial-health assets; only priced FX enters liquid assets. They do not increase spendable IDR cash or recorded operating income. Calculator projections keep their current reference value fixed.

Historical analysis selects the latest quantity snapshot and saved reference on or before the analysis date. A composite gold reference is dated no earlier than its most recent source observation. Historical prices are not backfilled from today's price. A positive balance without a rate has a null valuation and makes net worth/total assets incomplete. A zero quantity is worth zero even without a quote. Known gross-worth projections exclude unpriced gold/FX; stock purchase costs remain available.

## Missing or old quotes

Source timestamps and prices are shown on account cards. Source data older than three days produces a warning. Upstream failures keep saved rates and native quantities intact; manual refresh reports the failure. Check the provider status and outbound connectivity, then retry. Do not substitute zero or a fabricated reference rate. Quote changes invalidate shared market-cache revisions; quantity changes invalidate only the owning user's private revisions.
