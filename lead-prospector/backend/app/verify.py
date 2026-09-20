import re
from .config import settings

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ROLE = ("info","sales","support","admin","contact","hello","office")

class MockVerifier:
    def verify(self, email):
        if not email: return {"status":"no_email","sendable":False}
        if not _EMAIL.match(email): return {"status":"invalid","sendable":False}
        if email.split("@")[0].lower() in _ROLE: return {"status":"role","sendable":False}
        return {"status":"ok","sendable":True}

class HttpVerifier:
    def __init__(self):
        self.base, self.key = settings.verify_api_base, settings.verify_api_key
    def verify(self, email):  # TODO: call your verifier, map to {status, sendable}
        raise NotImplementedError

def get_verifier():
    return HttpVerifier() if settings.email_verifier == "http" else MockVerifier()