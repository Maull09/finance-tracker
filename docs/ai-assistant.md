# AI assistant setup

The assistant uses Ollama's OpenAI-compatible API through LangChain, with LangGraph managing chat/tool turns, receipt extraction, and the confirmation/rejection flow. Conversation history, receipt metadata, and pending drafts live in PostgreSQL through Drizzle. Model tools can read the signed-in user's financial data and prepare drafts; they cannot write financial transactions. Confirmation validates the edited draft, checks account ownership, locks the pending draft, and inserts the transaction and confirmation status atomically. Repeated confirmation returns a conflict.

## Local configuration

Add these server-only values to the ignored `.env` file:

```dotenv
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3.5:9b
```

Set `OLLAMA_ENABLED=false` to disable AI generation while retaining saved history
and existing draft review. Set it to `true` to enable generation with the model
and URL above. Redis is optional for chat and receipt extraction; automatic page
insights require both services and their separate worker. See the
[Redis and Ollama switches](development.md#redis-and-ollama-switches) for deployment
configuration and restart behavior.

The Next.js server must reach the configured Ollama host. If Ollama runs on another machine, use its LAN address in the ignored `.env`; a remote deployment needs connectivity to that network. The browser never connects to Ollama directly. No OpenAI account or API key is used. Keep LangSmith tracing disabled for private financial conversations.

Install dependencies, then run `npm run db:migrate` and `npm run db:check`. Migration 0012 adds four AI tables with the repository's `finance_user` ownership policies and does not change existing financial rows.

Run [ai-storage.sql](../scripts/ai-storage.sql) in the **Supabase project used by authentication** using its SQL editor. It creates the private `ai-receipts` bucket and ownership policies. If the application PostgreSQL database is separate from Supabase, apply this SQL to Supabase, not the application database. Storage uploads/downloads use the signed-in session, without a service-role key. The SQL can be rerun; it updates only this bucket and its named policies. Other broad Storage policies cannot grant another user access to this bucket because restrictive policies are included.

Restart the development server after changing environment variables. Open `/dashboard#ai` to chat. Open `/dashboard#transactions` and choose **Read receipt** to upload an image and review its draft. The assistant page contains chat only; pending drafts from both chat and receipts can be reviewed and confirmed on Transactions, including after reloading. Receipt reading still stores its extraction messages in conversation history.

## Supported behavior

- Chat can read account balances, monthly transaction totals, budgets, goals, debts, financial health indicators, and up to 50 transactions in a date range. Overview sections are capped at 100 rows. It can prepare up to three transaction drafts per message.
- All 13 financial pages generate contextual AI insights automatically once their records are ready. Transactions uses the full active filter, rather than just the visible pagination; budgets, reports, health, and calendar use their selected month; planning and simulation follow valid analysis inputs. The separate BullMQ worker receives authenticated job context and calculates aggregates under PostgreSQL ownership policies. Ollama receives only aggregate figures and recognised category labels, without account names, counterparties, transaction descriptions, stock symbols, or raw records. Successful results are saved in AI conversation history; **Discuss with AI** opens the corresponding conversation. The panel shows waiting, generating, failure, analysis time, and **Reanalyse**. Old results are discarded when context, language, user or financial revisions change. See [worker setup and deployment](development.md#automatic-ai-insight-worker).
- Open `/dashboard#financialHealth` to analyse a month. The application calculates the ratios and heuristic score; the model explains the existing aggregate indicators. Essential expenses and total monthly debt obligations are optional analysis inputs and are not saved as financial records. All four score components must be available. The current month is provisional; balances and stock prices are reconstructed through the period's closing date (today for the current month). The existing on-demand health API remains available, while the page uses the shared automatic insight queue.
- Each JPEG, PNG, or WebP receipt (maximum 5 MB) produces one expense draft using its final total. Non-IDR or unknown currency leaves the IDR amount blank. Unknown dates, accounts, and amounts remain blank for review. Extraction can be incorrect; check the original via **View receipt** before confirming.
- English and Indonesian are supported. The model runs locally, while receipt images are stored in Supabase. The model receives only tool-selected financial records, chat context, or the selected image. Responses are displayed as plain text.
- The page shows the latest 50 conversations and latest 100 messages/drafts per conversation. The model uses the latest 30 messages and 10 draft statuses. Six model requests per user per minute are permitted. A conversation admits one model request at a time, with a 120-second inference deadline and a 150-second processing lease.
- Pending drafts survive page reloads and server restarts. Confirmation resumes from the saved draft through a separate LangGraph decision flow; it does not rely on in-memory checkpoints. Only the explicit draft form action confirms a transaction.

## Verification and troubleshooting

For the page insight model check, set `AI_MODEL_TEST_URL` to the intended local `/v1` endpoint and run `npx vitest run tests/lib/ai/insight-model.integration.test.ts`. This sends synthetic aggregate figures only and blocks application database access. Queue, DOM, and PostgreSQL checks are documented in [worker setup](development.md#automatic-ai-insight-worker).

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npm audit --omit=dev`.

Optional live-model tests use `AI_MODEL_TEST_URL` set to the intended local `/v1` endpoint, then `npx vitest run tests/lib/ai/model.integration.test.ts`. They send synthetic chat prompts and prepare a draft with no account, while blocking database access. Set `AI_RECEIPT_TEST_PATH` to a synthetic PNG receipt showing a final total of Rp25,000 dated 9 October 2026 to include the image-reading check. These tests are skipped by default. PostgreSQL ownership/confirmation tests use the disposable local database setup described in [authentication.md](authentication.md); never point the test variables at the application database.

If chat fails, check that `/v1/models` lists `qwen3.5:9b` and the server can reach the configured endpoint. If uploads fail, verify the private bucket and policies in the authentication project's Storage settings. Failed extraction removes the uploaded image on a best-effort basis; cleanup failures may leave a private orphan object for an operator to remove. A timed-out process lease expires automatically. Failed requests preserve the user's chat input and image selection in the page; the submitted user message remains in history.
