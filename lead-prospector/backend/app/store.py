import uuid, time

_JOBS: dict[str, dict] = {}

def create(icp, goal):
    jid = uuid.uuid4().hex[:12]
    _JOBS[jid] = {"id": jid, "status": "queued", "icp": icp, "goal": goal,
                  "collected": 0, "passed": 0, "sendable": 0,
                  "created": time.time(), "file": None}
    return _JOBS[jid]

def get(jid):  return _JOBS.get(jid)
def all_jobs(): return sorted(_JOBS.values(), key=lambda j: j["created"], reverse=True)