import logging
from .providers import get_provider
from .verify import get_verifier
from .icp import classify
from .output import write_rows
from .config import settings
from . import store

logger = logging.getLogger("pipeline")

def run_job(job_id):
    job = store.get(job_id)
    if not job:
        return
    job["status"] = "running"
    try:
        prov, verf = get_provider(), get_verifier()
        goal = job["goal"]
        oversample = 5
        target_raw = goal * oversample
        rows, sendable = [], 0
        # pull in chunks so memory stays flat and you could checkpoint between chunks
        for offset in range(0, target_raw, settings.chunk_size):
            chunk_limit = min(settings.chunk_size, target_raw - offset)
            batch = prov.search(job["icp"], chunk_limit)
            if not batch:
                break
            for p in batch:
                job["collected"] += 1
                verdict = classify(p, job["icp"])
                p["icp_score"] = verdict["score"]
                p["icp_reason"] = verdict["reason"]
                v = verf.verify(p.get("email", ""))
                p["email_status"] = v["status"]
                p["sendable"] = v["sendable"]
                if not verdict["passed"]:
                    p["tab"] = "failed"
                elif v["sendable"]:
                    p["tab"] = "passed_with_email"
                    job["passed"] += 1
                    sendable += 1
                else:
                    p["tab"] = "passed_without_email"
                    job["passed"] += 1
                rows.append(p)
            if sendable >= goal:
                break
        job["sendable"] = sendable
        job["file"] = write_rows(settings.output_dir, job_id, rows)
        job["rows"] = rows[:50]  # Store first 50 rows for frontend preview
        job["status"] = "done"
    except Exception as e:
        logger.exception("Job %s failed: %s", job_id, e)
        job["status"] = "failed"
        job["error"] = str(e)