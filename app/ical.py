from datetime import date, datetime, timedelta
from typing import List

from icalendar import Calendar

MAX_EVENTS = 500


def _dt(c, name):
    p = c.get(name)
    return p.dt if p is not None else None


def parse_ics(text: str) -> List[dict]:
    try:
        cal = Calendar.from_ical(text)
    except Exception:
        raise ValueError("Invalid iCal data")
    out = []
    for c in cal.walk("VEVENT"):
        start = _dt(c, "DTSTART")
        if start is None:
            continue
        end = _dt(c, "DTEND")
        all_day = not isinstance(start, datetime)
        if end is None:
            dur = _dt(c, "DURATION")
            end = start + dur if dur else (start + timedelta(days=1) if all_day else start)
        if all_day:
            # iCal DTEND is exclusive for all-day events; Teamup's is inclusive
            end = max(start, end - timedelta(days=1))
        ev = {
            "title": str(c.get("SUMMARY", "(no title)")),
            "notes": str(c.get("DESCRIPTION", "")) or None,
            "location": str(c.get("LOCATION", "")) or None,
            "all_day": all_day,
            "start_dt": start.isoformat(),
            "end_dt": end.isoformat(),
        }
        rr = c.get("RRULE")
        if rr:
            ev["rrule"] = rr.to_ical().decode()
        out.append(ev)
        if len(out) > MAX_EVENTS:
            raise ValueError("Too many events (max %d)" % MAX_EVENTS)
    return out


