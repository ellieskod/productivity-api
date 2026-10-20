import httpx
from fastapi import HTTPException

from .config import Settings

BASE = "https://api.teamup.com"


async def call(s: Settings, method: str, path: str, **kw):
    if not s.teamup_calendar_key or not s.teamup_api_key:
        raise HTTPException(503, "Teamup not configured")
    url = "%s/%s/%s" % (BASE, s.teamup_calendar_key, path.lstrip("/"))
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.request(method, url, headers={"Teamup-Token": s.teamup_api_key}, **kw)
    if r.status_code >= 400:
        raise HTTPException(502, "Teamup error (%d)" % r.status_code)
    return r.json() if r.content else {}
