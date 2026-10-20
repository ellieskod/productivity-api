# Agent Gateway

FastAPI proxy so agents call scoped endpoints instead of holding real credentials.

- Agents authenticate with `Authorization: Bearer <key>`; each has its own scopes (`calendar:read`, `calendar:write`).
- Only SHA-256 hashes of agent keys are stored. Generate with `python gen_key.py`.
- Teamup credentials (calendar key from the Teamup link + API key) live only in Railway environment variables (see `.env.example`).
- Endpoints: `GET /calendar/subcalendars`, `GET /calendar/events?start_date&end_date`, `POST /calendar/events`, `DELETE /calendar/events/{id}`, `GET /health`.
- Add a new resource: new module + router + new scope in `app/main.py`.
- Deploy: connect repo to Railway (uses `railway.json`), set the env variables, always serve over HTTPS.
- Local: `pip install -r requirements.txt; uvicorn app.main:app --reload`; tests: `pytest`.


- Also: `PATCH /calendar/events/{id}` (change fields / move by setting start+end) and `POST /calendar/import` (body `{"ics": "<raw iCal text>", "subcalendar_ids": [..], "dry_run": false}`; recurring rules are passed through; re-importing creates duplicates, so use dry_run first).
- `GET /calendar/changed?modified_since=<unix ts>` returns changed/deleted events plus a `timestamp` to use as the next `modified_since` (durable, unlike the in-memory `/calendar/changes` webhook feed).
- `GET /calendar/search?query=..&start_date&end_date` searches events by text (dates optional).
