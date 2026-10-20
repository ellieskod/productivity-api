import logging
from datetime import date, datetime
from typing import Annotated, List, Literal, Optional

import base64
import hashlib
import hmac
import json
from collections import deque
from datetime import timezone

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Path, Query, Request
from pydantic import BaseModel

from . import teamup, ical
from .auth import require_scope
from .config import Settings, get_settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("gateway")

app = FastAPI(title="Agent Gateway")


@app.get("/health")
def health():
    return {"status": "ok"}


class EventIn(BaseModel):
    title: str
    start: datetime
    end: datetime
    notes: Optional[str] = None
    location: Optional[str] = None
    who: Optional[str] = None
    all_day: bool = False
    subcalendar_ids: Optional[List[int]] = None


EventId = Annotated[str, Path(pattern=r"^[0-9ridnew-]+$")]

cal = APIRouter(prefix="/calendar", tags=["calendar"])

_FIELDS = ("delete_dt", "id", "title", "notes", "location", "who", "start_dt", "end_dt", "all_day", "subcalendar_ids")


_WRITABLE = ("id", "version", "subcalendar_ids", "start_dt", "end_dt", "all_day", "notes", "title", "location", "who",
             "rrule", "signup_enabled", "comments_enabled", "custom")


def _slim(e: dict) -> dict:
    return {k: e.get(k) for k in _FIELDS}


@cal.get("/subcalendars")
async def subcalendars(
    agent: str = Depends(require_scope("calendar:read")),
    s: Settings = Depends(get_settings),
):
    d = await teamup.call(s, "GET", "subcalendars")
    return [{"id": x["id"], "name": x["name"]} for x in d.get("subcalendars", [])]


@cal.get("/events")
async def list_events(
    start_date: date,
    end_date: date,
    agent: str = Depends(require_scope("calendar:read")),
    s: Settings = Depends(get_settings),
):
    log.info("agent=%s calendar.list", agent)
    d = await teamup.call(s, "GET", "events", params={
        "startDate": start_date.isoformat(), "endDate": end_date.isoformat()})
    return [_slim(e) for e in d.get("events", [])]


@cal.get("/search")
async def search_events(
    query: str = Query(min_length=1, max_length=200),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    agent: str = Depends(require_scope("calendar:read")),
    s: Settings = Depends(get_settings),
):
    log.info("agent=%s calendar.search", agent)
    params = {"query": query}
    if start_date:
        params["startDate"] = start_date.isoformat()
    if end_date:
        params["endDate"] = end_date.isoformat()
    d = await teamup.call(s, "GET", "events", params=params)
    return [_slim(e) for e in d.get("events", [])]

@cal.get("/changed")
async def changed_events(
    modified_since: int,
    agent: str = Depends(require_scope("calendar:read")),
    s: Settings = Depends(get_settings),
):
    """Events created/changed/deleted (delete_dt set) since a UNIX timestamp.
    Pass the returned `timestamp` as modified_since next time to miss nothing."""
    log.info("agent=%s calendar.changed", agent)
    d = await teamup.call(s, "GET", "events", params={"modifiedSince": modified_since})
    return {"timestamp": d.get("timestamp"), "events": [_slim(e) for e in d.get("events", [])]}

@cal.post("/events", status_code=201)
async def create_event(
    ev: EventIn,
    agent: str = Depends(require_scope("calendar:write")),
    s: Settings = Depends(get_settings),
):
    log.info("agent=%s calendar.create", agent)
    subs = ev.subcalendar_ids or (
        [s.teamup_default_subcalendar_id] if s.teamup_default_subcalendar_id else None)
    if not subs:
        raise HTTPException(422, "subcalendar_ids required (no default configured)")
    body = {
        "subcalendar_ids": subs, "title": ev.title, "notes": ev.notes,
        "location": ev.location, "who": ev.who, "all_day": ev.all_day,
        "signup_enabled": False, "comments_enabled": False,
        "start_dt": ev.start.isoformat(), "end_dt": ev.end.isoformat(),
    }
    d = await teamup.call(s, "POST", "events", json=body)
    return _slim(d.get("event", {}))


@cal.delete("/events/{event_id}", status_code=204)
async def delete_event(
    event_id: EventId,
    agent: str = Depends(require_scope("calendar:write")),
    s: Settings = Depends(get_settings),
):
    log.info("agent=%s calendar.delete %s", agent, event_id)
    await teamup.call(s, "DELETE", "events/" + event_id)


class EventPatch(BaseModel):
    title: Optional[str] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    notes: Optional[str] = None
    location: Optional[str] = None
    who: Optional[str] = None
    all_day: Optional[bool] = None
    subcalendar_ids: Optional[List[int]] = None
    redit: Optional[Literal["single", "future", "all"]] = None


@cal.patch("/events/{event_id}")
async def update_event(
    event_id: EventId,
    patch: EventPatch,
    agent: str = Depends(require_scope("calendar:write")),
    s: Settings = Depends(get_settings),
):
    """Change any fields; setting start/end moves the event. For recurring events pass redit (single/future/all)."""
    log.info("agent=%s calendar.update %s", agent, event_id)
    cur = (await teamup.call(s, "GET", "events/" + event_id)).get("event", {})
    changes = patch.dict(exclude_unset=True)
    if "start" in changes:
        changes["start_dt"] = changes.pop("start").isoformat()
    if "end" in changes:
        changes["end_dt"] = changes.pop("end").isoformat()
    cur.update(changes)
    body = {k: cur.get(k) for k in _WRITABLE if k in cur}
    if patch.redit:
        body["redit"] = patch.redit  # which occurrences of a recurring event to change
    d = await teamup.call(s, "PUT", "events/" + event_id, json=body)
    return _slim(d.get("event", {}))


class IcalImport(BaseModel):
    ics: str
    subcalendar_ids: Optional[List[int]] = None
    dry_run: bool = False


@cal.post("/import")
async def import_ical(
    body: IcalImport,
    agent: str = Depends(require_scope("calendar:write")),
    s: Settings = Depends(get_settings),
):
    """Import every VEVENT from raw iCal text. Not idempotent: re-importing duplicates events."""
    subs = body.subcalendar_ids or (
        [s.teamup_default_subcalendar_id] if s.teamup_default_subcalendar_id else None)
    if not subs:
        raise HTTPException(422, "subcalendar_ids required (no default configured)")
    if len(body.ics) > 2_000_000:
        raise HTTPException(413, "iCal too large")
    try:
        events = ical.parse_ics(body.ics)
    except ValueError as e:
        raise HTTPException(422, str(e))
    log.info("agent=%s calendar.import n=%d dry_run=%s", agent, len(events), body.dry_run)
    if body.dry_run:
        return {"parsed": len(events), "events": events}
    created, failed = 0, []
    for ev in events:
        try:
            await teamup.call(s, "POST", "events", json={**ev, "subcalendar_ids": subs, "signup_enabled": False, "comments_enabled": False})
            created += 1
        except HTTPException:
            failed.append(ev["title"])
    return {"parsed": len(events), "created": created, "failed": failed}


CHANGES: deque = deque(maxlen=200)  # in-memory; cleared on restart/redeploy


@cal.get("/changes")
async def recent_changes(
    limit: int = 50,
    agent: str = Depends(require_scope("calendar:read")),
):
    """Most recent Teamup webhook notifications, newest first (in-memory; for durable sync use /changed)."""
    return list(CHANGES)[::-1][: max(1, min(limit, 200))]


def _signature_ok(secret: str, raw: bytes, header: str) -> bool:
    digest = hmac.new(secret.encode(), raw, hashlib.sha256).digest()
    sig = header.strip()
    if sig.lower().startswith("sha256="):
        sig = sig[7:]
    candidates = (digest.hex(), base64.b64encode(digest).decode())
    return any(hmac.compare_digest(sig.lower() if c == candidates[0] else sig, c) for c in candidates)


@app.post("/webhooks/teamup", include_in_schema=False)
async def teamup_webhook(
    request: Request,
    teamup_signature: str = Header(default=""),
    s: Settings = Depends(get_settings),
):
    raw = await request.body()
    if not s.teamup_webhook_secret or not _signature_ok(s.teamup_webhook_secret, raw, teamup_signature):
        raise HTTPException(401, "Invalid signature")
    try:
        p = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Invalid JSON")
    msg_id = p.get("id")
    if msg_id is not None and any(c["id"] == msg_id for c in CHANGES):
        return {"ok": True}  # retry of an already stored message
    d = p.get("dispatch") or {}
    CHANGES.append({
        "id": msg_id,
        "received_at": datetime.now(timezone.utc).isoformat(),
        "trigger": d.get("trigger"),
        "event": d.get("event"),
    })
    log.info("teamup webhook %s", d.get("trigger"))
    return {"ok": True}

app.include_router(cal)









