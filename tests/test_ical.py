from app.ical import parse_ics

ICS = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:1
DTSTART:20260105T090000Z
DTEND:20260105T100000Z
SUMMARY:Standup
RRULE:FREQ=WEEKLY;BYDAY=MO
END:VEVENT
BEGIN:VEVENT
UID:2
DTSTART;VALUE=DATE:20260110
DTEND;VALUE=DATE:20260112
SUMMARY:Trip
END:VEVENT
END:VCALENDAR
"""


def test_parse():
    a, b = parse_ics(ICS)
    assert a["title"] == "Standup" and a["rrule"] == "FREQ=WEEKLY;BYDAY=MO"
    assert b["all_day"] and b["start_dt"] == "2026-01-10" and b["end_dt"] == "2026-01-11"
