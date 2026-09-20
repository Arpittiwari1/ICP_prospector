import os
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from .config import settings
from .providers import get_provider
from . import store, pipeline

app = FastAPI(title="Lead Prospector")
app.add_middleware(CORSMiddleware, allow_origins=settings.origins,
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health(): return {"ok": True}

@app.get("/api/enums")
def enums():
    return {"seniority": ["founder","c_suite","vp","head","manager","ic"],
            "countries": ["NL","GB","DE","US","SE","BE","FR"],
            "industries": ["SaaS","E-commerce","Fintech","Healthcare","Logistics"]}

@app.post("/api/count")
def count(icp: dict): return {"count": get_provider().count(icp)}

@app.post("/api/search")
def search(icp: dict): return {"people": get_provider().search(icp, 10)}

@app.post("/api/jobs")
def start(payload: dict, bg: BackgroundTasks):
    job = store.create(payload.get("icp", {}), int(payload.get("goal", 25)))
    bg.add_task(pipeline.run_job, job["id"]); return job

@app.get("/api/jobs/{jid}")
def status(jid: str):
    job = store.get(jid)
    if not job: raise HTTPException(404)
    return job

@app.get("/api/jobs/{jid}/download")
def download(jid: str):
    job = store.get(jid)
    if not job:
        raise HTTPException(404, "Job not found")
    filepath = job.get("file")
    if not filepath or not os.path.exists(filepath):
        raise HTTPException(404, "CSV file not found or not ready yet")
    return FileResponse(filepath, media_type="text/csv", filename=os.path.basename(filepath))

@app.get("/api/jobs")
def jobs(): return {"jobs": store.all_jobs()}