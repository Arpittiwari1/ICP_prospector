# ICP Prospector — Project Guide

> **Note:** This project is a demo of the original ICP Prospector I built for a
> client during my job. It recreates the same idea with mock/synthetic data so it
> can be shared and demoed freely — no client code, keys, or data included.

## What this project is

**ICP Prospector** is a lead-sourcing tool that finds the right people for a
business, the same way Apollo.io and similar tools work ("Apollo-style").

Given an **Ideal Customer Profile (ICP)** — who you want to sell to — the tool:

```
search provider  ->  ICP classifier  ->  email verify  ->  CSV / UI output
```

It runs end-to-end out of the box with **mock data (zero API keys)** so you can
demo it instantly, and it can be pointed at the real **Blitz API** (or any
provider) with one config change.

---

## Repository layout

```
├── backend/      FastAPI API — search, classify, verify, jobs, CSV export
├── frontend/     React + Vite UI — filter builder, live job progress, leads table
├── README.md     Quick start + config
└── LICENSE       MIT
```

- Backend:  http://127.0.0.1:8000  (API docs at `/docs`)
- Frontend: http://localhost:8080  (Vite dev server proxies `/api` to the backend)

---

## How it works

### 1. The ICP filter builder (frontend)

The React app (`frontend/src/App.jsx`) presents an Apollo-style filter builder
split into four collapsible panels:

| Panel | What you filter |
|---|---|
| Person | Job titles include/exclude, exact vs tokenized, headline search, seniority, function, min LinkedIn connections |
| Person Location | Countries, cities, sales regions, continents |
| Company | Employee range, industries include/exclude, keywords, company names, LinkedIn URLs, domains, type, founded year, min followers |
| Company HQ | HQ country, HQ cities include/exclude, HQ region, HQ continent |

Every chip list supports pasting comma/semicolon/newline lists, and countries /
industries are resolved against known reference data (`blitzData.js` + the
backend's `blitz_industries.json`).

Two buttons drive the backend:

- **Check Pool Size** → `POST /api/count` → returns the estimated audience size (TAM).
- **Find Leads** → `POST /api/jobs` with the ICP + a **goal** (how many email-sendable leads you want). The UI then polls `GET /api/jobs/{id}` every ~0.8s and shows live progress.

The ICP payload is "pruned" so empty filters are dropped before hitting the API,
keeping requests small regardless of how much of the form is filled in.

### 2. Job + pipeline (backend)

When a job starts:

1. **Normalize the ICP** (`backend/app/icp.py`) — flattens the nested Blitz-style
   query into standard fields (`titles`, `seniority`, `countries`, `industries`,
   `employees_min/max`, …) so the classifier and providers speak one dialect.
2. **Search** (`backend/app/providers.py`) — pulls leads in **chunks** (default 50)
   so memory stays flat even on large runs. The mock provider synthesizes people;
   the real `HttpProvider` hits the Blitz API (`/v2/search/people` with cursor
   paging) and then **enriches each person's email** (`/v2/enrichment/email`).
3. **Classify** (`backend/app/icp.py:classify`) — every lead is scored against the
   ICP rules (title, seniority, country, industry, company size). Each *failing*
   check produces a human-readable reason, and the lead gets an **ICP score 0–100**.
4. **Verify email** (`backend/app/verify.py`) — the mock verifier accepts
   well-formed, non-role emails (`info@`, `sales@` → role, not sendable). The real
   verifier can be swapped in via `email_verifier="http"`.
5. **Bucket** — each lead lands in one of three tabs:
   - `passed_with_email` — the deliverable
   - `passed_without_email` — matches ICP but no usable email (LinkedIn touch)
   - `failed` — off-ICP, with the reason
6. **Output** (`backend/app/output.py`) — all rows are written to a CSV under
   `backend/data/run_<job>_<timestamp>.csv`. The job also keeps the first 50 rows
   in memory so the UI can show a preview table. The frontend gets a **Download CSV** link.

The pipeline **exits early** once the goal of sendable leads is reached, so it
never over-collects.

### 3. Config (`backend/.env`)

| Setting | Default | Meaning |
|---|---|---|
| `search_provider` | `mock` | `mock` = synthetic data, `http` = real Blitz API |
| `email_verifier` | `mock` | `mock` or `http` |
| `data_api_base` / `data_api_key` | empty | Blitz API base + key |
| `verify_api_base` / `verify_api_key` | empty | email verifier endpoint + key |
| `chunk_size` | 50 | leads per batch (keeps memory flat) |
| `output_dir` | `./data` | where CSVs are written |
| `allowed_origins` | 5173/8000/8080/3000 | CORS origins for the frontend |

### 4. Key API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/enums` | Valid enums for UI dropdowns |
| POST | `/api/count` | Estimated pool size for an ICP |
| POST | `/api/search` | Sample 10 leads for an ICP |
| POST | `/api/jobs` | Start an async job, returns `{id, status, …}` |
| GET | `/api/jobs/{id}` | Job status + results |
| GET | `/api/jobs/{id}/download` | Download the job's CSV |
| GET | `/api/jobs` | List all jobs |

---

## Demo — painted for a client

> A working demo needs no API keys: everything below produces real output from
> the mock provider. To use real leads, set `search_provider="http"` and add the
> Blitz API credentials in `backend/.env`.

### Scenario

A B2B outreach agency ("Northwind Growth") wants decision-makers at mid-size
SaaS companies to sell their cold-email service.

**Step 1 — Start the app**

```bash
# backend/
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend/, in a second terminal
cd frontend
npm install
npm run dev
```

Open http://localhost:8080.

**Step 2 — Build the ICP**

- **Person**: Job titles include — `CEO, Founder, CTO, VP Sales, Head of Marketing`
- **Person**: Seniority — `C-Team, VP, Director, Manager`
- **Person Location**: Countries — `US, GB, DE, NL`
- **Company**: Employee range — `51-200, 201-500, 501-1000`
- **Company**: Industries — `Software Development, SaaS, Fintech`
- **Goal**: `25` (leads with a usable email)

**Step 3 — Check pool size**

Click **Check Pool Size**. The backend classifies the query shape and returns an
estimated audience (in mock mode a deterministic number like ~1,200), shown as a
pill: `1,200 in pool`.

**Step 4 — Find Leads**

Click **Find Leads**. A background job starts (`POST /api/jobs`), and the UI
polls the job status and shows live metrics:

```
Found: 84   Matched: 61   With Email: 25   Goal: 25   Progress: 100%
```

The job stops as soon as 25 sendable leads land. Each lead has an ICP score and a
tab:

| Tab | What it means |
|---|---|
| Sendable | `passed_with_email` — matches ICP + verified email, ready for outreach |
| No Email | `passed_without_email` — matches ICP, no verified email (LinkedIn touch) |
| Failed | off-ICP, e.g. `Title not in target roles` or `Country 'FR' off-target` |

**Step 5 — Export**

Click **Download CSV**. The file `backend/data/run_<job>_<timestamp>.csv` opens in
Excel with columns: `first_name, last_name, title, seniority, department, company,
website, industry, employee_count, country, email, linkedin_url, icp_score,
icp_reason, email_status, sendable, tab`.

The client can now send those 25 verified emails and use the `passed_without_email`
list for LinkedIn touches — and with real providers, everything above runs on the
same UI with zero code changes.

---

## Going from demo to production

1. Implement the real provider — already scaffolded in `backend/app/providers.py`
   (`HttpProvider` hits Blitz `/v2/search/people` + `/v2/enrichment/email`).
2. Wire a real email verifier in `backend/app/verify.py`.
3. Replace the in-memory job store (`backend/app/store.py`) with SQLite/Postgres
   and add checkpointing between chunks.
4. Swap the CSV writer (`backend/app/output.py`) for Google Sheets / Excel.
5. Add presets, blocklists (DNC), and used-lead memory per client.

Each swap is self-contained — no cross-file refactors.