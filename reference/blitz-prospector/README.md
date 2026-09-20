# ⚡ Blitz Prospector

An Apollo-style lead search dashboard powered entirely by the
[BlitzAPI](https://blitz-api.ai) — people search, company search, employee
finder, waterfall ICP, email/phone enrichment, and clean CSV export.

No AI in the loop: every search is plain HTTP calls against `api.blitz-api.ai`,
filtered exactly by what you set in the sidebar.

## Run it

Requires **Node 18+** (no `npm install` needed — zero dependencies).

```bash
cd blitz-prospector
node server.js
# → open http://localhost:3141
```

Paste your Blitz API key when prompted. The key is stored in your browser's
localStorage only, and every request goes browser → local server →
`api.blitz-api.ai` with your `x-api-key` header. Nothing else ever sees it.

## What each tab does

| Tab | Blitz endpoint(s) | What you get |
|---|---|---|
| **People** | `/v2/search/people` + `/v2/enrichment/email` + `/v2/enrichment/phone` | Apollo-style prospecting: title/level/function/location filters + full company firmographic filters. "Check TAM" shows the audience size before you commit. "Pull leads" starts a server-side job (see Pulls). |
| **Companies** | `/v2/search/companies` | Firmographic search: name, keywords, industry (534 LinkedIn industries), size, HQ, type, founded year, followers. TAM check, bulk pull + CSV. |
| **Company Staff** | `/v2/search/employee-finder` + `/v2/enrichment/domain-to-linkedin` | List everyone at one company, filtered by seniority, department, and location. Resolve a domain to its LinkedIn page inline. |
| **Waterfall ICP** | `/v2/search/waterfall-icp-keyword` | The decision-maker finder: define an ordered title cascade (Tier 1 → Tier N) and run it across a list of companies; each company returns its best-fit contact with the tier that matched. |
| **Lookups** | `/v2/enrichment/*` | One-off tools: email finder, phone finder, reverse email → person, reverse phone → person, company enrichment, domain ⇄ LinkedIn, headcount by country, headcount by department. |
| **Pulls** | (local job engine) | Every "Pull leads" run lives here: live progress, cancel, resume, and workbook download. |

## Big pulls (20k+) run on the server

"Pull leads" doesn't run in your browser — it starts a **background job on
the local Node server**:

- Close the tab, come back later — the job keeps running and the Pulls tab
  shows live progress.
- Every page of results is **checkpointed to disk** (`data/jobs/`). If the
  server stops mid-run, the job comes back as *paused* on restart and a
  one-click **Resume** continues where it left off — nothing is re-bought.
- Pulls support up to **50,000 leads** per job.
- The deliverable is **one Excel workbook (.xlsx)** with two tabs:
  **Verified Emails** (ready for outreach) and **No Email** (usable for
  LinkedIn touches) — frozen header row, sized columns, clean formatting.

## Clients & used-lead memory

Pick (or create) a **client** in the top-right selector and optionally type a
**campaign name** before pulling. The server remembers every lead exported
per client (`data/clients/`), so the next pull for the same client can:

- **Tag mode** (default): previously exported leads still come through, but
  the `used_in` column shows which campaign already used them, e.g.
  `july-outbound (2026-07-02)`.
- **Skip mode** (checkbox): previously used leads are skipped entirely and
  the pull keeps going until it reaches your target with fresh leads only.

Every row in the workbook also carries `client` and `campaign` columns.

## Do-not-contact list (per client)

Click **🚫 DNC** next to the client selector to manage a hard exclusion list
for the active client — existing customers, unsubscribes, competitors,
anyone who should never show up in a pull for that client. Paste emails
and/or website domains (comma, semicolon, or newline separated); each is
classified automatically and stored under `data/clients/<client>.dnc.json`.

This is deliberately separate from the used-lead memory above: used-lead
memory stops you re-selling the *same* lead to the *same* client twice, DNC
stops you from *ever* contacting a specific person or company for that
client, regardless of what search produced them.

Enforcement:
- **Pull leads**: blocked **domains** are filtered out during collection —
  the API is never even charged for that company. Blocked **emails** can
  only be checked once email enrichment runs (the email isn't known before
  then), so that filter runs as a cleanup pass right after enrichment
  finishes; the job may land slightly under its goal if a chunk of results
  turn out to be blocked, the same tradeoff `skip_used` already makes.
- **Quick Search people tab**: blocked domains are filtered as results come
  in, same as above (email-level blocking isn't applied here, since this
  tab is a live preview, not the bulk export path).
- **Employee Finder**: before spending a single credit, the target company's
  domain is checked against the DNC list — if it's blocked, the search is
  refused outright with a clear message instead of returning (and paying
  for) results you can't use. Blocked emails are removed after enrichment,
  same as everywhere else.
- **Waterfall ICP**: every target company is checked against the DNC list
  *before* running the cascade — blocked companies are dropped from the
  target list and never cost a waterfall credit, not just filtered out of
  the results afterward. Blocked emails are removed after enrichment.

The Pulls tab and job status show `blocked_domain`/`blocked_email` counts
so you can see how much got filtered.

## Companies → Waterfall bridge

Search or pull companies on the **Companies** tab, then click
**🌊 Send to Waterfall** to push every loaded company's LinkedIn URL into
Waterfall ICP's target list (merged with whatever's already there, deduped)
and jump straight to that tab. This turns a firmographic company search
into an account-based decision-maker search in one click, instead of
copying LinkedIn URLs by hand between tabs. Sending more than 300 companies
asks for confirmation first, since each one is a separate paid API call.

## Industry + exact company size on every lead

Blitz's person search doesn't return firmographics on the profile itself, so
when **"Add industry + exact company size"** is checked (on by default), the
job runs one extra phase after collection: it looks up each **unique**
company (`/v2/enrichment/company`) and writes back the real `industry` and
`employees_on_linkedin` (an exact number, not the "51-200" range) onto every
row from that company. Costs 1 credit per unique company — not per lead —
and results are cached to `data/company-cache.json` (refreshed after 90 days),
so pulling the same accounts again for a different client or campaign never
re-buys them.

## Comma-separated paste for every filter list

Any filter box that takes multiple values (titles, exclude titles, keywords,
industries, company names, LinkedIn URLs, cities, etc.) now accepts a whole
pasted list at once — paste `agency, reseller, staffing, recruiting` and all
four become separate chips immediately, no more one-at-a-time re-entry.
Commas, semicolons, newlines, and tabs all work as separators. Typing a
single value and pressing Enter still works exactly as before.

For countries and industries specifically, every pasted token is checked
against Blitz's known list before it becomes a chip. If any of them don't
match — usually a typo — a panel appears right under that field and stays
there (it does **not** auto-dismiss like the old toast did) showing
"Matched X of Y — N need attention" plus the exact value(s) that failed, so
you can spot the typo and fix it or pick it from the dropdown. Dismiss it
with the × once you've dealt with it, or it clears automatically when you
clear that field.

## TAM check

The **📊 Check TAM** button on the People and Companies tabs runs your
current filters with `max_results: 1` and shows the total matching audience
("TAM: 2,733 people match"). Tweak filters, click again, and watch the number
move — before spending credits on a pull. Costs 1 credit per check.

## Industry + exact size everywhere, not just Pull leads

**Employee Finder** and **Waterfall ICP** now have their own **🏢 Enrich
company** action (a manual button on Employee Finder, a checkbox on
Waterfall — checked by default) so their CSV exports carry the same
`industry` and `company_size_exact` columns as a Pull-leads workbook. All
three share the same server-side cache, so a company looked up from one tab
is already there for the others.

## Editing filter chips

- **Click anywhere on a chip** to remove it (not just the small ×).
- Each chip box shows a small **✕ button** in the corner once it has at
  least one value — click it to clear that field only, leaving every other
  filter untouched.

## Current-role enforcement (anti-stale-data)

The most common complaint about Apollo-style tools: a lead search surfaces
someone by a title they held two jobs ago, not the one they hold today. Blitz
can in principle match a title phrase found anywhere in a person's work
history, not just their current role — so **"Only current role"** (checked
by default on People, Pull leads, and Waterfall ICP) re-verifies every match
against that person's *current* title and headline only, using the same
exact-vs-tokenized rules as the title filter itself:

- `[Bracketed]` phrases require an exact (case/accent-insensitive) match
  against the current title/headline.
- Plain phrases use tokenized matching — every word must appear in the
  current title/headline — with common title abbreviations expanded on both
  sides first (`CMO` ⇄ `Chief Marketing Officer`, `VP` ⇄ `Vice President`,
  `CFO`, `CTO`, `COO`, `CRO`, `CHRO`, `CISO`, `CIO`, `CPO`, and more), so
  searching the short form still recognizes a spelled-out current title and
  vice versa.

A match that only holds up against a **past** role never counts toward your
goal — but on a **Pull leads** job it isn't discarded either. It's set aside
into its own **"Needs Title Confirmation"** workbook tab (alongside
Verified Emails / No Email), so you can eyeball it yourself before deciding
whether it's actually still good — nothing genuinely gets lost, it just
doesn't dilute your confirmed list. The job status / Pulls tab shows how many
landed there (`blocked_stale_title`). Every row also carries the
**`title_match`** column (`current` or `past`) so it's never ambiguous which
is which; blank when no title filter was set, since there's nothing to verify.

On the quick **Search people** tab and **Waterfall**, unchecking "Only
current role" keeps past-role matches mixed into the same list instead
(labeled via `title_match`) rather than a separate tab — those don't produce
a multi-sheet workbook the way Pull leads does.

Waterfall verifies a match against *any* tier's title criteria (not just the
tier Blitz reports as the winner), since qualifying for any tier in the
cascade still counts as "genuinely current" for that ICP — a blocked match
shows up as a placeholder row explaining why, so you know a candidate
existed for that company but got filtered, rather than assuming nobody
matched at all.

### Checking the impact before you commit

**Check TAM** alone can't tell you how many matches would survive current-role
enforcement — it only asks Blitz for a raw count and never looks at an
individual person, so there's nothing for the current-role check to run
against. The **📐 Estimate title-match impact** button (next to Check TAM)
solves that: it samples up to 50 real matches, runs the same current-role
check a pull would apply, and reports the split — e.g. *"Sample of 50: 92%
hold that title right now (~2,514 of 2,733 est.) · 8% only matched a past
role (~219 est.)"* — so you can judge the real-world impact and decide
whether to leave enforcement on or off *before* running a full pull, without
needing to run one twice. Costs roughly 1 credit per person sampled (up to
~50), on top of the 1 credit a plain TAM check costs.

## Filter by a pasted list of company websites

Blitz's search only accepts a **LinkedIn company URL**, not a website domain
— so the People tab's **"Company website URLs"** field does the translation
for you. Paste a list of domains (`acme.com, foo.io, bar.co` — protocol and
`www.` are stripped automatically), and before the search runs each one is
resolved to its LinkedIn company URL via Blitz's `domain-to-linkedin`
lookup (~1 credit per domain, cached — the same company is never re-bought
across searches, pulls, or clients).

The resolved company list is combined with your other company filters (if
you also typed LinkedIn URLs directly, both lists are merged), and then
**every other filter still applies on top** — titles, location, size,
industry, keywords, exclusions all combine with AND logic, exactly like
picking those companies from a dropdown first and then filtering within them.

If none of the pasted URLs match a real company, the search deliberately
returns **zero results** with a clear message rather than silently ignoring
the filter and searching everyone — you'll see this both in Check TAM and
in the Pulls tab (`0 of 3 company URLs matched`).

**Large lists (50+ companies):** Blitz rejects any single request with more
than 50 company URLs in its filter, so once your resolved list crosses that
line, the dashboard automatically splits it into batches of 50 and runs them
one after another:
- **Pull leads** handles this transparently — batches are chunked, searched,
  and resumed correctly across a restart, no matter how many domains you
  paste (tested with 500+).
- **Check TAM** runs one batch per group of 50 and sums the totals, so the
  number stays accurate no matter how large the list.
- The quick **Search people** tab (the live preview, not Pull leads) is
  capped to previewing the first 50 matched companies with a note telling
  you to use Pull leads for full coverage — it's meant for a quick look, not
  the bulk export path.

## Saved ICP presets

On the People tab, build a filter set (titles, seniority, location, industry,
size, etc.), type a name in **Saved ICP presets**, and click **Save**. Presets
are stored in this browser (not tied to a client) so the same ICP can be
reused across clients — pick it from the dropdown and click **Load** to
restore every chip, checkbox, and number field in one shot. **Delete selected
preset** removes one you no longer need. Saving again under the same name
overwrites it.

## Filters (exactly the Blitz wire format)

**Person:** job titles include/exclude (exact-match `[brackets]` supported,
optional headline search), seniority level, department/function, country,
city, continent, sales region, min connections.

**Company:** employee range or min/max count, industry include/exclude,
description keywords include/exclude, name include/exclude, HQ
country/city/region/continent, company type, founded-year range, min
LinkedIn followers, or an explicit list of company LinkedIn URLs.

## Credits & rate limits

- People/company search: **1 credit per result** returned.
- Email enrichment: **1 credit** on success. Phone: **5 credits** (US only).
- The dashboard runs a built-in rate limiter (~4 req/s, matching the 5 req/s
  key limit) with automatic retry/backoff on 429s, so large pulls just work.
- Your plan + remaining credits are shown live in the top-right badge.

## CSV output

Leads CSV columns: `first_name, last_name, full_name, job_title, company,
company_domain, email, email_status, phone, phone_status, city, state,
country, linkedin_url, company_linkedin_url, headline, connections,
job_start_date, skills`. UTF-8 with BOM, so Excel opens it correctly.
