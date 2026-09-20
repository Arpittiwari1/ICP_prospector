# Lead Prospector

A provider-agnostic lead-sourcing tool following the "Apollo-style" pattern:

```
search provider  ->  ICP classifier  ->  email verify  ->  CSV / sheet output
```

Runs end-to-end with **mock data** (zero API keys) for immediate demo. Swap to real providers via env vars.

---

## Quick Start

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate          # Windows
# source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
cp .env.example .env              # mock mode by default
uvicorn app.main:app --reload --port 8000
```

Open `frontend/index.html` in a browser → UI at `http://localhost:8000/docs` for API docs.

---

## Features

- **Zero keys to start**: MockProvider + MockVerifier ship synthetic leads
- **Provider-agnostic**: Swap Apollo/Blitz/Hunter, MillionVerifier/ZeroBounce via one env var
- **Explainable classifier**: Every dropped lead has a human-readable reason
- **ICP-pass ≠ email-sendable**: Leads without verified email go to `passed_without_email`, not dropped
- **Chunked pipeline**: Flat memory, early exit when goal hit
- **CSV output**: Swap for Google Sheets in one file
- **Single-file frontend**: No build step, opens by double-click

---

## Config (`.env`)

```bash
search_provider="mock"        # "mock" | "http"
email_verifier="mock"         # "mock" | "http"
data_api_base=""              # e.g. https://api.apollo.io/v1
data_api_key=""
verify_api_base=""            # e.g. https://api.millionverifier.com
verify_api_key=""
chunk_size=50                 # leads per batch
http_batch_size=5
output_dir="./data"
allowed_origins="http://localhost:5173,http://localhost:8000"
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/enums` | Valid enums for UI dropdowns |
| POST | `/api/count` | Estimated pool size for ICP |
| POST | `/api/search` | Sample 10 leads for ICP |
| POST | `/api/jobs` | Start async job, returns `{id, status, ...}` |
| GET | `/api/jobs/{id}` | Job status + results |
| GET | `/api/jobs` | List all jobs |

---

## Output CSV Fields

`first_name, last_name, title, seniority, department, company, website, industry, employee_count, country, email, linkedin_url, icp_score, icp_reason, email_status, sendable, tab`

Tab values: `passed_with_email`, `passed_without_email`, `failed`

---

## Turning Prototype Into Real Tool

1. Implement `HttpProvider.count()` and `.search()` in `providers.py`
2. Implement `HttpVerifier.verify()` in `verify.py`
3. Replace `output.py` with Google Sheets writer
4. Swap `store.py` for SQLite/Postgres + add checkpointing
5. Add colleague lookup, blocklists, saved presets

Each is a **self-contained swap** — no cross-file refactors.

---

## Architecture

See `architecture.md` for full component breakdown.
See `decision.md` for design rationale on every major choice.

---

## Clean-Room Implementation

Built fresh from the OSS Build Guide. Generic names, synthetic sample data, MIT license. No client code, sheet templates, column maps, prompts, or keys. Defensibly your own IP.

---

## License

MIT