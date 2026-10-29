# ICP Prospector

Describe your ideal customer in plain English, or fine-tune the filters yourself. ICP Prospector finds matching people, scores each one against your profile, checks whether they have a usable email, and gives you the results as a table or a CSV.

```
ICP (filters or plain English)  ->  search provider  ->  ICP classifier  ->  email verify  ->  table / CSV
```

It runs out of the box with **mock data and no API keys**, so you can try the whole flow in a few minutes. Connect a real data provider and an email verifier when you're ready.

> Built as a clean-room demo of an Apollo-style lead tool. All sample data is synthetic. See [`project_guide.md`](project_guide.md) for the full design notes.

---

## Features

**Frontend**
- **Dashboard**: summary numbers, charts for the lead funnel and outcomes, and recent searches.
- **ICP bar**: describe a customer ("CTOs at fintech startups in Germany") and the filters fill in. Undo is one click.
- **Filter builder**: four collapsible sections (person, person location, company, company HQ). Sections that receive values open automatically.
- **Live search progress**: step-by-step status, a progress bar toward your goal, and a stats row.
- **Leads**: sortable table on desktop, cards on phones, with tabs for sendable, no-email and off-ICP leads.
- **Companies**: accounts found across your searches, with their contacts.
- **Search history** and **saved profiles**: reopen past searches, or save a filter set and reuse it.
- **Responsive and themed**: works on phones, with light and dark modes that follow your system setting.

**Backend**
- **Zero keys to start**: mock provider and mock verifier generate synthetic leads.
- **Provider-agnostic**: swap in a real data provider or email verifier with environment variables.
- **Explainable scoring**: every lead gets an ICP score from 0 to 100, plus a reason for each check it fails.
- **Email-aware buckets**: a lead who matches your ICP but has no email goes to `passed_without_email`. It isn't dropped.
- **Chunked pipeline**: stays memory-flat on large runs and stops early once your goal is reached.
- **CSV export**: every job writes a CSV you can download.

---

## Project layout

```
icp_personal/
├── backend/            FastAPI service: search, classify, verify, jobs, CSV export
│   └── app/
│       ├── main.py         routes
│       ├── pipeline.py     job pipeline
│       ├── providers.py    mock and HTTP search providers
│       ├── verify.py       email verifiers
│       ├── icp.py          ICP normalisation and scoring
│       ├── nl_icp.py       plain-English ICP via Ollama
│       └── output.py       CSV writer
├── frontend/           React + TypeScript + Ant Design UI
│   ├── api/            Vercel serverless function (plain-English ICP)
│   └── src/
│       ├── pages/          dashboard, search, history, job, companies, saved profiles
│       ├── components/     filter form, ICP bar, leads table, charts, layout
│       ├── store/          Redux Toolkit slices (filters, theme, saved profiles)
│       ├── api/            typed API client
│       └── lib/            ICP payload builder and helpers
└── project_guide.md    design notes and demo walkthrough
```

---

## Quick start

You need a recent Python 3 and Node.js LTS.

### 1. Backend (port 8000)

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate          # Windows
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

The API docs are at http://localhost:8000/docs.

### 2. Frontend (port 8080)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:8080. The Vite dev server forwards `/api` to the backend on port 8000.

---

## Configuration

### Backend: `backend/.env`

| Variable | Default | Meaning |
|----------|---------|---------|
| `search_provider` | `mock` | `mock` for synthetic data, `http` for a real data API |
| `email_verifier` | `mock` | `mock` or `http` |
| `data_api_base` / `data_api_key` | empty | Base URL and key for the data provider |
| `verify_api_base` / `verify_api_key` | empty | Base URL and key for the email verifier |
| `chunk_size` | `50` | Leads per batch |
| `http_batch_size` | `5` | API calls per batch |
| `output_dir` | `./data` | Where CSV files are written |
| `allowed_origins` | local dev ports | CORS origins allowed to call the API |
| `ollama_base` | `http://localhost:11434` | Ollama server for the plain-English ICP bar |
| `ollama_api_key` | empty | Set for Ollama Cloud (`https://ollama.com`) |
| `ollama_model` | `llama3.1` | Model name, for example `gpt-oss:120b` |
| `ollama_timeout` | `60` | Seconds to wait for Ollama |

### Frontend: `frontend/.env.local` (never commit this file)

```bash
OLLAMA_BASE=https://ollama.com
OLLAMA_API_KEY=your-key
OLLAMA_MODEL=gpt-oss:120b
```

These values are read on the server only. Don't prefix them with `VITE_`, because that would publish them in the browser bundle. `frontend/.env.example` lists the names without values.

### Choosing a model

`gpt-oss:120b` gave the fastest and most accurate results in testing, at about 1.5 seconds per request. Smaller models sometimes add filters the description didn't ask for.

---

## Deploying the frontend (Vercel)

1. Import the repository in Vercel.
2. Set **Root Directory** to `frontend`.
3. Add `OLLAMA_BASE`, `OLLAMA_API_KEY` and `OLLAMA_MODEL` under **Settings → Environment Variables**.
4. Deploy.

The plain-English ICP bar runs as a Vercel function (`frontend/api/parse-icp.ts`), so it works on the hosted site without the Python backend.

**What the hosted site doesn't do yet:** searching, the pool-size check, job history, companies and CSV download all call the Python backend. Without a hosted backend, those features will show errors on the live site.

---

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/enums` | Valid values for the UI dropdowns |
| POST | `/api/parse-icp` | Turn `{prompt}` into ICP filters via Ollama |
| POST | `/api/count` | Estimated pool size for an ICP |
| POST | `/api/search` | Sample 10 leads for an ICP |
| POST | `/api/jobs` | Start an async job: `{icp, goal}` |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/{id}` | Job status and preview rows |
| GET | `/api/jobs/{id}/download` | Download the job's CSV |

---

## CSV fields

`first_name, last_name, title, seniority, department, company, website, industry, employee_count, country, email, linkedin_url, icp_score, icp_reason, email_status, sendable, tab`

`tab` is one of `passed_with_email`, `passed_without_email` or `failed`.

---

## Turning the prototype into a real tool

1. Implement `HttpProvider.count()` and `.search()` in `backend/app/providers.py`.
2. Implement `HttpVerifier.verify()` in `backend/app/verify.py`.
3. Replace `backend/app/output.py` with a Google Sheets writer if you need one.
4. Replace `backend/app/store.py` with SQLite or Postgres, and add checkpointing.
5. Add saved presets, blocklists and colleague lookup on the server, to match the frontend's saved profiles.

Each change is a self-contained swap, so you won't need cross-file refactors.

---

## Development

```bash
cd frontend
npm run typecheck    # TypeScript
npm run lint         # oxlint
npm run build        # typecheck + production build
```

---

## License

MIT
