# Finance Tracker Design System

Status: active

## Purpose

Finance Tracker helps one person record, review, and plan their money in IDR. The interface must make balances, changes, warnings, and next actions easy to scan on desktop and mobile. It should feel calm and precise, never promotional or ornamental.

## Foundations

### Colour

Use the blue-led palette below. It replaces the previous teal treatment throughout the product.

| Token | Value | Use |
| --- | --- | --- |
| Brand | `#0052FF` | Primary actions, selected navigation, data emphasis |
| Brand active | `#003ECC` | Hover and active states; linked text |
| Brand soft | `#EEF3FF` | Selected rows and low-emphasis blue surfaces |
| Brand border | `#C9D8FF` | Blue notices and selected-control borders |
| Ink | `#0A0B0D` | Headings, amounts, and primary text |
| Body | `#5B616E` | Supporting copy |
| Muted | `#7C828A` | Tertiary metadata only |
| Hairline | `#DEE1E6` | Borders and dividers |
| Canvas | `#F7F7F7` | Application background |
| Surface | `#FFFFFF` | Cards, menus, and form controls |
| Positive | `#047857` | Income and favourable changes |
| Warning | `#B45309` | Approaching limits and incomplete data |
| Negative | `#BE123C` | Losses, overdue amounts, and destructive actions |

Do not introduce teal for status, navigation, controls, or charts. Colour reinforces meaning; labels, signs, and amounts must still communicate the state without colour.

### Typography

Use the locally loaded Geist family for all interface text. It keeps screens compact and legible while matching the existing application stack.

| Role | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Page title | 30px / 36px desktop; 24px / 30px mobile | 600 | Page-level task |
| Section title | 20px / 28px | 600 | Cards and grouped information |
| Body | 14px / 22px | 400 | Descriptions and controls |
| Supporting text | 12px / 18px | 400–500 | Dates, hints, and metadata |
| Financial figure | 20–30px / 1.15 | 600 | Amounts; always use tabular numerals |

Use sentence case. Keep supporting copy short, concrete, and action-oriented. English and Indonesian must convey the same intent.

Indonesian currency displays use a nonbreaking space after `Rp` (for example, `Rp 1.299.162`), with the existing decimal precision preserved. Month selectors use translated month names and a separate year control, so the selected application language determines their labels rather than the browser's native month-input language. Keep period labels visible and preserve each page's allowed date range.

### Spacing, shape, and elevation

- Use a 4px rhythm: `4, 8, 12, 16, 24, 32, 48, 64`.
- Use 8px radius for controls and 12px radius for cards and notices.
- Use 1px `Hairline` borders to group information. Avoid decorative gradients and heavy shadows.
- Keep primary controls at least 44px high. Align labels, fields, and related actions on their control edge at desktop widths; stack them with clear gaps on narrow screens.
- Use a 150–200ms colour transition for direct interaction only. Respect reduced-motion preferences.

## Components and states

- **Landing:** Use a left-aligned, compact value proposition alongside the real report component with explicitly labelled example data. Follow with a concise feature overview, a three-action getting-started sequence, and native FAQ disclosures. Keep the same light, blue-led theme throughout.
- **Navigation:** Group destinations into everyday records, planning, and analysis without changing their names or hash destinations. Make the selected page visible, and keep account management near account balances.
- **Touch and keyboard:** Buttons, navigation, tabs, and dialog-close controls have at least a 44px touch target. Dialog headings reserve space for the close control; scrollable tables expose a labelled, keyboard-focusable region.
- **Page actions:** Align filters and actions on their bottom edge. Actions named Add open the relevant form; empty states show an available next action. Amounts wrap inside their containers rather than widening the page.
- **Content:** Explain financial consequences at the action: transfers preserve total cash, allocations keep cash in their account, and payments affect recorded balances. Use a specific saving or calculating state appropriate to the task.

- **Primary button:** Brand background, white text, Brand active on hover.
- **Secondary button:** Surface with Hairline border; use for a related alternative.
- **Selected navigation and summary:** Brand soft background with Brand active text.
- **Forms:** Show a persistent, visible label. Place hint text below its field. Keep submission feedback near the action.
- **Cards:** Surface background, Hairline border, quiet structure. Financial figures are the visual anchor.
- **Charts:** Lead with Brand. Use Positive and Negative for income and expense or gains and losses. Use neutral blue-grey values for remaining series.

## Product behaviour and content

### AI assistant

When AI is disabled by server configuration, disable its navigation and receipt action before mounting chat or upload controls. Direct chat links show the existing localized disabled message without fetching conversations. Saved transaction drafts remain available for review and confirmation. Omit contextual insight panels before mounting their request and polling lifecycle when either AI or its queue is disabled; do not flash a loading or retry state for a deliberately disabled feature.

The AI assistant page contains conversation history and chat only. Receipt upload belongs to Transactions, beside the manual transaction action. Chat and receipt images can produce editable transaction drafts; review and confirmation belong to Transactions. Only a visible Confirm transaction action changes the financial record. Pending drafts remain available there after reloading. Assumption: one receipt creates one expense using its final IDR total, rather than separate line-item transactions.

Use the existing Geist typography, Brand `#0052FF`, Ink `#0A0B0D`, Surface `#FFFFFF`, Canvas `#F7F7F7`, and Hairline `#DEE1E6`. Place conversation history beside the selected conversation on wide screens and above it on mobile. Keep messages left aligned, with quiet blue emphasis for the user's messages. Link chat-generated drafts to Transactions. Use a scrollable receipt dialog for upload and immediate review, and show pending AI drafts on Transactions for later review. Emphasize the IDR amount and explain the balance consequence beside confirmation. Show reading, replying, saving, missing fields, rejected drafts, and service failures near their actions. Preserve unsent text and selected images after failure. Unknown receipt dates and amounts require user input rather than invented values.

The dashboard is a working financial record: accounts feed balances, transactions feed budgets and reports, and planning views estimate future changes without altering recorded transactions. Feedback must state what changed, what failed, and the available next action.

Use concise copy that names the user task. Prefer “Update daily prices” over implementation details, and “Add budget” over generic verbs. Avoid defensive technical caveats in routine UI; present data date, error state, or incompleteness only where it changes a financial decision.

Describe what a feature calculates or changes directly, in both languages. State projection inputs, allocation behaviour, and permanent deletion consequences in plain terms. Keep financial warnings specific and actionable.

Transaction groups collect records for a named activity, such as a trip, across spending categories. Each transaction has one optional group. Show group spending totals and transaction counts for the full filtered period, with an action to view the group's records. Use the existing blue selection treatment, Geist typography, quiet borders, and stacked layouts on mobile; keep amounts prominent and group names able to wrap.

Within group cards, expenses and available income use matching label-and-amount blocks: small muted labels above equally prominent tabular amounts, Negative for expenses and Positive for income. Place the blocks side by side only when the card has enough width; otherwise stack them. Keep the view-transactions action aligned at the bottom of each card.

### Expense calculator

Assumption: users want to see how planned cash flow affects both cash and net worth on desktop and mobile. Keep the existing calculator form and show current cash beside current net worth, then projected cash beside projected net worth in the results and monthly table. Net worth uses recorded cash, valued stocks, receivables, and outstanding debts; only cash changes in the projection. State that stock values, receivables, and debts remain at their current values. Cash allocated to goals and funds is already included. If stock prices are missing, label current and projected amounts as known subtotals and explain the incomplete valuation. Use existing Geist typography, quiet borders, blue emphasis, tabular amounts that wrap, and stacked mobile summaries. Calculations never change financial records.

### Financial health

Assumption: the user wants to review recorded monthly finances and identify the next practical action on desktop or mobile. Place Financial health in analysis navigation and link it from the dashboard. Lead with the selected month, a clearly labelled heuristic score, and the data needed to complete it; follow with ratios, their formulas, and transaction behaviour. Use Geist, existing blue tokens, quiet bordered surfaces, tabular amounts, and stacked mobile controls. Show unavailable ratios explicitly rather than treating missing data as zero. Current months are provisional; balance-sheet values use the selected period's closing date (today for the current month), with price dates visible. Essential monthly expenses and total monthly debt payments are user-supplied analysis inputs, kept only while the page is open. Inputs never change financial records. AI insights run automatically through the shared page insight panel from the server-calculated report, use plain text, and follow valid inputs, language, and record changes. Show generating, retryable failure, and incomplete-data states near the action.

### Contextual AI insights

Assumption: users want a short explanation of the financial view they have just opened, without interrupting record keeping. Each financial page shows one quiet, full-width insight panel below its heading or summary. Use existing Geist type, Surface, Hairline, Brand links, and stacked mobile controls. Keep the header compact, with a small assistant icon, a short explanation of the scope, and a secondary Reanalyse action. Waiting and generating states use one visible status line with an icon; never imply a known completion percentage. Results lead with the paragraph, followed by a quiet divided footer grouping the analysis time, record-review hint, and next actions. Use 16px padding on mobile and 20px on wider screens, with the insight paragraph spanning the full content width inside that padding and no fixed height. Generate automatically after the page data is ready; follow its period, filters, and valid analysis inputs. Show one paragraph of three or four short sentences, at most 80 words, focused on the main finding, one or two supporting figures, and one practical next action. Describe missing data in everyday language; never display raw field names, status codes, or null values in explanations. Keep the main page usable while insights are waiting or generating. Failures offer a retry. Discard results from an earlier filter, language, user, or data revision. The AI assistant remains a conversation view. Insights explain server-calculated aggregates and never change financial records.

## Implementation rule

`src/app/globals.css` owns the semantic colour tokens. Components should use those tokens and existing shared primitives rather than scattered colour values. When a lasting visual decision changes, update this document before changing the implementation.
