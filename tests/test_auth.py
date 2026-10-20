import hashlib

from fastapi.testclient import TestClient

from app.config import Agent, Settings, get_settings
from app.main import app

KEY = "secret"
H = hashlib.sha256(KEY.encode()).hexdigest()
app.dependency_overrides[get_settings] = lambda: Settings(
    agent_keys={"ro": Agent(key_sha256=H, scopes=["calendar:read"])})
c = TestClient(app)
P = {"start_date": "2026-01-01", "end_date": "2026-01-02"}


def test_no_token():
    assert c.get("/calendar/events", params=P).status_code == 401


def test_bad_token():
    assert c.get("/calendar/events", params=P, headers={"Authorization": "Bearer x"}).status_code == 401


def test_scope_enforced():
    body = {"title": "x", "start": "2026-01-01T10:00:00Z", "end": "2026-01-01T11:00:00Z"}
    r = c.post("/calendar/events", json=body, headers={"Authorization": "Bearer " + KEY})
    assert r.status_code == 403


def test_import_needs_write_scope():
    r = c.post("/calendar/import", json={"ics": "x"}, headers={"Authorization": "Bearer " + KEY})
    assert r.status_code == 403

def test_webhook_signature_and_changes():
    import hmac, json
    app.dependency_overrides[get_settings] = lambda: Settings(
        teamup_webhook_secret="s3",
        agent_keys={"ro": Agent(key_sha256=H, scopes=["calendar:read"])})
    body = json.dumps({"id": "m1", "calendar": "x", "dispatch": {"trigger": "event.created", "event": {"id": "9"}}}).encode()
    sig = hmac.new(b"s3", body, hashlib.sha256).hexdigest()
    assert c.post("/webhooks/teamup", content=body, headers={"Teamup-Signature": "bad"}).status_code == 401
    for _ in range(2):  # duplicate delivery is stored once
        assert c.post("/webhooks/teamup", content=body, headers={"Teamup-Signature": sig}).status_code == 200
    r = c.get("/calendar/changes", headers={"Authorization": "Bearer " + KEY}).json()
    assert len(r) == 1 and r[0]["trigger"] == "event.created" and r[0]["event"] == {"id": "9"}


def test_event_id_validated():
    app.dependency_overrides[get_settings] = lambda: Settings(agent_keys={'rw': Agent(key_sha256=H, scopes=['calendar:write'])})
    r = c.delete('/calendar/events/abc.json', headers={'Authorization': 'Bearer ' + KEY})
    assert r.status_code == 422

