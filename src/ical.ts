import ICAL from 'ical.js';

const MAX_EVENTS = 500;

export interface ParsedEvent {
  title: string;
  start_dt: string;
  end_dt: string;
  all_day: boolean;
  notes?: string;
  location?: string;
  rrule?: string;
}

export function parseIcs(text: string): ParsedEvent[] {
  try {
    const jcal = ICAL.parse(text);
    const component = new ICAL.Component(jcal);
    const vevents = component.getAllSubcomponents('vevent');

    const out: ParsedEvent[] = [];

    for (const vevent of vevents) {
      const startProp = vevent.getFirstPropertyValue('dtstart');
      if (!startProp) continue;

      const start = startProp.toJSDate ? new Date(startProp.toJSDate()) : new Date(startProp);
      const allDay = startProp.icaltype === 'date';

      let end: Date;
      const endProp = vevent.getFirstPropertyValue('dtend');
      if (endProp) {
        end = endProp.toJSDate ? new Date(endProp.toJSDate()) : new Date(endProp);
      } else {
        const durProp = vevent.getFirstPropertyValue('duration');
        if (durProp && typeof durProp === 'object' && 'toJSDuration' in durProp) {
          // Rough duration handling - iCal.js uses Duration objects
          end = new Date(start.getTime() + 3600000); // default 1 hour
        } else {
          end = allDay ? new Date(start.getTime() + 86400000) : start;
        }
      }

      if (allDay) {
        // iCal DTEND is exclusive for all-day events; Teamup's is inclusive
        end = new Date(Math.max(start.getTime(), end.getTime() - 86400000));
      }

      const ev: ParsedEvent = {
        title: String(vevent.getFirstPropertyValue('summary') || '(no title)'),
        start_dt: start.toISOString(),
        end_dt: end.toISOString(),
        all_day: allDay,
      };

      const description = vevent.getFirstPropertyValue('description');
      if (description) {
        ev.notes = String(description) || undefined;
      }

      const location = vevent.getFirstPropertyValue('location');
      if (location) {
        ev.location = String(location) || undefined;
      }

      const rrule = vevent.getFirstPropertyValue('rrule');
      if (rrule) {
        ev.rrule = rrule.toICALString?.() || String(rrule);
      }

      out.push(ev);
      if (out.length > MAX_EVENTS) {
        throw new Error(`Too many events (max ${MAX_EVENTS})`);
      }
    }

    return out;
  } catch (error) {
    throw new Error('Invalid iCal data: ' + (error instanceof Error ? error.message : String(error)));
  }
}
