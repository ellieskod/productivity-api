# Calendar gateway: agent guide

You manage a Teamup calendar through a gateway API. You never hold Teamup credentials; use only the base URL and key you were given.

- **Base URL:** `https://<your-app>.up.railway.app` (replace)
- **Auth:** every request needs `Authorization: Bearer <AGENT_KEY>`
- **Format:** JSON. Datetimes are ISO 8601 with timezone, e.g. `2026-03-02T09:00:00+01:00`. Dates are `YYYY-MM-DD`.
- **Errors:** `401` bad key, `403` your key lacks the scope (`calendar:read` / `calendar:write`), `422` invalid input, `502` Teamup rejected the call.

## Before anything: find the sub-calendar

New events need a `subcalendar_ids` list unless the server has a default.

```
GET /calendar/subcalendars
-> [{"id": 123, "name": "Work"}, ...]
```

Ask the user which one to use if it is unclear.

## Import a calendar

Send the raw `.ics` text (not a URL). Max 500 events / 2 MB. Always do a dry run first and show the user the count and a few titles.

```
POST /calendar/import
{"ics": "BEGIN:VCALENDAR...", "subcalendar_ids": [123], "dry_run": true}
-> {"parsed": 42, "events": [...]}
```

If the user confirms, repeat with `"dry_run": false`:

```
-> {"parsed": 42, "created": 41, "failed": ["Some title"]}
```

Importing is **not idempotent**: running it twice creates duplicates. Never re-import the same file. Report any `failed` titles to the user.

## Add an event

```
POST /calendar/events
{"title": "Dentist", "start": "2026-03-02T09:00:00+01:00", "end": "2026-03-02T10:00:00+01:00",
 "location": "Main St 1", "notes": "Bring forms", "subcalendar_ids": [123]}
-> 201 {"id": "456", "title": "Dentist", ...}
```

Optional: `who`, `all_day` (true for all-day events). Keep the returned `id`.

## Move or change an event

Send only the fields that change. To move an event, send new `start` and `end` (both).

```
PATCH /calendar/events/456
{"start": "2026-03-03T09:00:00+01:00", "end": "2026-03-03T10:00:00+01:00"}
```

Changeable fields: `title`, `start`, `end`, `notes`, `location`, `who`, `all_day`, `subcalendar_ids`.

Recurring events: use the instance id (`<id>-rid-<unix start time>`, as returned by listing) and add `"redit"` to say what to change: `"single"` (this occurrence), `"future"` (this and later), or `"all"`. If the user did not say which, ask.

## Delete an event

```
DELETE /calendar/events/456   -> 204
```

Confirm with the user before deleting, and never bulk-delete. For recurring events, this deletes the given id; check what you are targeting first.

## Look things up

- List a range: `GET /calendar/events?start_date=2026-03-01&end_date=2026-03-31`
- Search text: `GET /calendar/search?query=dentist&start_date=2026-01-01&end_date=2026-12-31` (pass dates if results look empty)
- Changes since last check: `GET /calendar/changed?modified_since=<unix timestamp>` returns `{"timestamp": ..., "events": [...]}`. Store `timestamp` and use it as `modified_since` next time. Events with `delete_dt` set were deleted.

Event fields returned: `id`, `title`, `notes`, `location`, `who`, `start_dt`, `end_dt`, `all_day`, `subcalendar_ids`, `delete_dt`.

## Rules

1. Look up an event (list or search) to get its `id` before changing or deleting it. Never guess ids.
2. Confirm destructive or large actions (delete, import) with the user first.
3. Check for conflicts by listing the range before adding or moving events.
4. Do not retry failed writes blindly: list the range first to see whether the write already happened.
5. Never ask for or store Teamup keys. Everything goes through this API.
