# Architecture Decisions

## 1. Provider-Agnostic Design (Protocol + Factory)
**Decision**: Use `typing.Protocol` for `SearchProvider` and `EmailVerifier` interfaces, with factory functions (`get_provider()`, `get_verifier()`) that return mock or HTTP implementations based on env config.

**Why**: 
- Zero vendor lock-in. The pipeline code never imports Apollo, Blitz, MillionVerifier, etc. directly.
- Swap providers by changing one env var (`search_provider=http`).
- Mock implementations let the whole app run end-to-end with **zero API keys** — demo-ready immediately.
- Only the `HttpProvider`/`HttpVerifier` stubs contain vendor-specific mapping code.

## 2. Deterministic, Explainable Classifier (No LLM)
**Decision**: Rule-based `icp.py` with explicit pass/fail + score + human-readable `reason` string. No LLM calls.

**Why**:
- Auditable: a human can read why *any* lead was dropped.
- Deterministic: same ICP + same lead = same result every time.
- Cheap & fast: no token costs, no latency, no rate limits.
- The "ICP-pass vs email-sendable" split (see #4) is the piece that fixes the classic "900 pass but only 100 usable" complaint.

## 3. In-Memory Job Store (Start Simple)
**Decision**: Simple dict `_JOBS` with `uuid` keys. No DB.

**Why**:
- Zero infra to start. Works locally, in CI, on any container host.
- Jobs are short-lived (minutes); persistence is a separate, self-contained swap later (SQLite/Postgres).
- `store.py` has only 3 functions — trivial to replace when needed.

## 4. Separate ICP-Pass from Email-Sendable
**Decision**: Classification verdict and email verification are **independent**. A lead can pass ICP but have no verifiable email → goes to `passed_without_email` tab, not dropped.

**Why**:
- Business reality: you still want the contact even if email isn't verified yet.
- Enables waterfall: run email-finder later on `passed_without_email` without re-running the whole pipeline.
- The CSV/Sheets output has four clear tabs: `passed_with_email`, `passed_without_email`, `failed`, `raw`.

## 5. Chunked, Resumable Pipeline
**Decision**: `pipeline.py` pulls in `chunk_size` batches, processes each, and can early-exit when `sendable >= goal`.

**Why**:
- Memory stays flat regardless of goal size (100 or 10,000 leads).
- Checkpointing between chunks is a one-line addition later (save cursor/offset to job store).
- Early exit saves API credits when goal is hit mid-chunk.

## 6. CSV Output First, Sheets as Swap
**Decision**: `output.py` writes CSV. Google Sheets is a drop-in replacement for `write_rows()`.

**Why**:
- CSV works everywhere, no auth, no rate limits, trivial to inspect.
- Sheets migration guide in code comment: create tabs, append rows, delete blank rows (not clear) to avoid the "used range" gap bug.
- Sheets client has identical signature — swap in one file.

## 7. Single-File Frontend (No Build)
**Decision**: `frontend/index.html` is plain HTML + JS `fetch`. No React, Vite, npm, bundler.

**Why**:
- Zero build step, zero dependencies, opens by double-click.
- Runs against local backend or deployed URL.
- Upgrade path to React + Vite is additive — doesn't touch backend.

## 8. CORS via `allowed_origins` Env
**Decision**: Comma-separated origins in `.env`, parsed to list in `Settings.origins`.

**Why**:
- Works for localhost dev (`5173` for Vite, `8000` for FastAPI docs) and any deployed frontend.
- No code changes when frontend moves to Cloudflare Pages, Netlify, etc.

## 9. Clean-Room Implementation (No Client Code)
**Decision**: Every file written fresh from the OSS Build Guide. Generic names, synthetic sample data, MIT license.

**Why**:
- Defensibly your own IP. A copy of client code is not.
- Safe to open-source, reuse, or commercialize.
- The guide explicitly draws this line; we stay on the "your own work" side.

## 10. n8n Workflows Are Reference Only
**Decision**: The 8 JSON files in `c:\Users\divya\Downloads\n8n-icp-snapshot\` are **not imported or executed**. They document a different (workflow-based) implementation for integration clarity only.

**Why**:
- This repo is the Python FastAPI app — the primary deliverable.
- Keeping both in sync is unnecessary work; the n8n version is a snapshot from 2026-07-09.
- If someone wants the n8n version, they import those JSONs into n8n separately.