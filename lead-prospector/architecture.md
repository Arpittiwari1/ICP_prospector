# Lead Prospector Architecture (Python FastAPI)

## Overview
This is a provider-agnostic lead-sourcing tool following the "Apollo-style" pattern. The entire pipeline can run with **mock data** (no API keys needed) for demo purposes, then swap to real providers later.

The architecture mirrors the OSS Build Guide (`Lead_Prospector_OSS_Build_Guide.md`) exactly.

---

## 1. High-Level Pipeline (one line)

```
search provider  ->  ICP classifier  ->  email verify  ->  CSV / sheet output
```

Each stage is behind an **interface** so vendors can be swapped without touching the pipeline.

---

## 2. Tech Stack (exact match to guide)

| Layer | Technology |
|---|---|
| **Backend** | Python + FastAPI (async, tiny, docs at `/docs`) |
| **HTTP Client** | `httpx` for outbound calls |
| **Config** | `pydantic-settings` for env-driven settings |
| **Data Validation** | `pydantic` v2 |
| **Frontend** | Single static `index.html` (plain JS `fetch`), no build step |
| **Storage** | In-memory job dict to start; swap for SQLite/Postgres later |
| **Output** | CSV to start; swap for Google Sheets later |
| **Hosting** | Backend on any container host (Render, Fly, Railway, VPS); frontend as static files |

---

## 3. Repo Layout (exact match)

```
lead-prospector/
  backend/
    requirements.txt
    .env.example
    app/
      __init__.py
      config.py       env-driven settings
      providers.py    SearchProvider interface + MockProvider + HttpProvider stub
      icp.py          rule-based classifier (pass/fail + score + reason)
      verify.py       EmailVerifier interface + MockVerifier + HttpVerifier stub
      pipeline.py     provider -> classify -> verify -> output, chunked + resumable
      store.py        in-memory job store
      output.py       CSV writer (swap for Sheets)
      main.py         FastAPI app + endpoints + background job runner
  frontend/
    index.html        single-file UI
  LICENSE             MIT
  README.md
```

---

## 4. Component Details

### 4.1 `app/config.py` - Env-driven Settings
- `Settings` class via `pydantic_settings`
- All settings from the guide: `search_provider`, `email_verifier`, `data_api_base`, `data_api_key`, `verify_api_base`, `verify_api_key`, `chunk_size`, `http_batch_size`, `output_dir`, `allowed_origins`
- `.env.example` included so the app runs with zero keys (mock mode)

### 4.2 `app/providers.py` - Data Source Behind an Interface
- **Person shape** dict with these exact fields:
  `first_name, last_name, title, seniority, department, company, website, industry, employee_count, country, city, email, linkedin_url`
- **Protocol** `SearchProvider` with `count(icp)` and `search(icp, limit)`
- **MockProvider**: synthetic data so the app runs with **zero API keys**
- **HttpProvider**: stub that maps ICP filters to the real API's request shape (vendor-specific mapping is the only vendor code)
- `get_provider()` returns `HttpProvider()` or `MockProvider()` based on settings

### 4.3 `app/icp.py` - Rule-Based, Explainable Classifier
- Deterministic, human-auditable
- Separates **ICP-pass** from **email-sendable** (critical design point)
- Returns `{"passed": bool, "score": int, "reason": string}`
- Checks: title, seniority, country, industry, company size
- Junior guard: assistant/intern/trainee roles blocked unless "manager" present

### 4.4 `app/verify.py` - Deliverability Behind an Interface
- **Person email** verified for format + role detection
- **MockVerifier**: synthetic verdicts (`ok`, `invalid`, `role`, `no_email`)
- **HttpVerifier**: stub for real verifier API (MillionVerifier, ZeroBounce, etc.)
- `get_verifier()` returns `HttpVerifier()` or `MockVerifier()` based on settings
- **Key design**: ICP-pass and email-sendable are reported **separately**. A person can pass ICP but have no verifiable email → goes to `passed_without_email`, not dropped.

### 4.5 `app/store.py` - Jobs (In-Memory to Start)
- Simple dict `_JOBS: dict[str, dict]`
- `create(icp, goal)` → returns job ID
- `get(jid)` → retrieves job
- `all_jobs()` → sorted by creation time
- No persistence across restarts (swap for SQLite/Postgres later)

### 4.6 `app/output.py` - CSV Writer (Swap for Sheets Later)
- `FIELDS` array includes: `first_name, last_name, title, seniority, department, company, website, industry, employee_count, country, email, linkedin_url, icp_score, icp_reason, email_status, sendable, tab`
- `write_rows(out_dir, job_id, rows)` → writes CSV
- **Sheets migration guide**: replace `write_rows` with Sheets client creating tabs (`passed_with_email`, etc.) and appending rows. Note: Sheets `append` writes after the tracked *used range*, so delete blank rows if a gap appears.

### 4.7 `app/pipeline.py` - Tie It Together, Chunked
- Core orchestration: `run_job(job_id)`
- Flow: `prov.search()` → `classify(p, icp)` → `verf.verify(p.email)` → assign tab (`passed_with_email`, `passed_without_email`, `failed`)
- **Chunked**: memory stays flat; can checkpoint between chunks
- Stops when `sendable >= goal` (early exit)
- Writes CSV via `write_rows` and marks job `done`

### 4.8 `app/main.py` - the API
- FastAPI app with CORS
- Endpoints (exact names from guide):
  - `GET /health` → `{"ok": True}`
  - `GET /api/enums` → seniority, countries, industries
  - `POST /api/count` → `{"count": get_provider().count(icp)}`
  - `POST /api/search` → `{"people": get_provider().search(icp, 10)}`
  - `POST /api/jobs` → starts background job, returns job ID
  - `GET /api/jobs/{jid}` → job status
  - `GET /api/jobs` → list all jobs
- Runs via: `uvicorn app.main:app --reload --port 8000` (docs at `/docs`)

---

## 5. Frontend (`frontend/index.html`)
- Single static file, no build step
- UI: titles, countries, goal inputs; Count + Run buttons
- Polls `/api/jobs/{jid}` every 800ms until `done`
- Shows job result as JSON

---

## 6. Deployment (when live)
- **Backend**: Dockerfile `python:3.12-slim`, copy, pip install, `uvicorn app.main:app --host 0.0.0.0 --port $PORT` → Render/Fly/Railway/VPS. Health check `/health`.
- **Frontend**: Host static files anywhere (Cloudflare Workers/Pages, Netlify, same box). If different origin, add to `ALLOWED_ORIGINS` in CORS.
- **CI**: push to `main` → host auto-deploys. Small GitHub Action can build/ship frontend.

---

## 7. Turning Prototype Into Real Tool (priority order, each self-contained swap)
1. Real search provider (`HttpProvider`) against your chosen data API
2. Real email verifier (`HttpVerifier`)
3. Google Sheets output instead of CSV
4. Persistence (SQLite/Postgres) instead of in-memory store, plus run checkpoints so restart resumes a big pull
5. Colleague/persona lookup, per-client blocklists, saved presets — all additive

---

## 8. Keeping It Clean (and Yours)
- Build fresh from this guide with generic names and synthetic sample data
- Do not paste a client's proprietary code, sheet templates, column maps, prompts, or keys
- A clean, generic reimplementation of a well-known pattern is defensibly your own work and safe to open-source
- This guide keeps you firmly on the "your own work" side of the line

---

## Appendix - the n8n ICP (for reference only)
The n8n workflow JSON files in `c:\Users\divya\Downloads\n8n-icp-snapshot\` are a **separate, older implementation** (workflow-based, not this app). They are kept only for integration clarity. This Python FastAPI app is the primary deliverable.