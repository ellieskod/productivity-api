import crypto from 'node:crypto';
import { Settings, HTTPException, getSettings, requireScope } from './auth';
import * as teamup from './teamup';
import * as ical from './ical';

interface Env {
  AGENT_KEYS?: string;
  TEAMUP_CALENDAR_KEY?: string;
  TEAMUP_API_KEY?: string;
  TEAMUP_DEFAULT_SUBCALENDAR_ID?: string;
  TEAMUP_WEBHOOK_SECRET?: string;
}

// In-memory storage for recent changes (limited to 200)
class ChangeLog {
  private changes: any[] = [];
  private maxSize = 200;

  add(change: any) {
    this.changes.unshift(change);
    if (this.changes.length > this.maxSize) {
      this.changes.pop();
    }
  }

  getRecent(limit: number = 50): any[] {
    return this.changes.slice(0, Math.min(limit, 200));
  }

  hasById(id: any): boolean {
    return this.changes.some(c => c.id === id);
  }
}

const changeLog = new ChangeLog();

const FIELDS = [
  'delete_dt',
  'id',
  'title',
  'notes',
  'location',
  'who',
  'start_dt',
  'end_dt',
  'all_day',
  'subcalendar_ids',
];

const WRITABLE = [
  'id',
  'version',
  'subcalendar_ids',
  'start_dt',
  'end_dt',
  'all_day',
  'notes',
  'title',
  'location',
  'who',
  'rrule',
  'signup_enabled',
  'comments_enabled',
  'custom',
];

function slim(e: any): any {
  return FIELDS.reduce((acc, k) => {
    acc[k] = e[k];
    return acc;
  }, {} as any);
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ detail: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleError(error: any): Response {
  if (error instanceof HTTPException) {
    return errorResponse(error.status, error.message);
  }
  console.error('Unhandled error:', error);
  return errorResponse(500, 'Internal server error');
}

function signatureOk(secret: string, raw: ArrayBuffer, header: string): boolean {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(raw))
    .digest();

  const sig = header.trim().toLowerCase();
  const sigWithoutScheme = sig.startsWith('sha256=') ? sig.slice(7) : sig;

  const hexSig = digest.toString('hex');
  const base64Sig = Buffer.from(digest).toString('base64');

  try {
    return (
      crypto.timingSafeEqual(Buffer.from(sigWithoutScheme), Buffer.from(hexSig)) ||
      crypto.timingSafeEqual(Buffer.from(sigWithoutScheme), Buffer.from(base64Sig))
    );
  } catch {
    return false;
  }
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;

  try {
    // Health check
    if (pathname === '/health' && method === 'GET') {
      return jsonResponse({ status: 'ok' });
    }

    const settings = getSettings(env);

    // Calendar subcalendars
    if (pathname === '/calendar/subcalendars' && method === 'GET') {
      await requireScope('calendar:read')(request, settings);
      const d = await teamup.call(settings, 'GET', 'subcalendars');
      const subs = d.subcalendars || [];
      return jsonResponse(subs.map((x: any) => ({ id: x.id, name: x.name })));
    }

    // Calendar events list
    if (pathname === '/calendar/events' && method === 'GET') {
      await requireScope('calendar:read')(request, settings);
      const start_date = url.searchParams.get('start_date');
      const end_date = url.searchParams.get('end_date');

      if (!start_date || !end_date) {
        return errorResponse(400, 'start_date and end_date required');
      }

      const d = await teamup.call(settings, 'GET', 'events', {
        params: { startDate: start_date, endDate: end_date },
      });

      return jsonResponse((d.events || []).map(slim));
    }

    // Calendar search
    if (pathname === '/calendar/search' && method === 'GET') {
      await requireScope('calendar:read')(request, settings);
      const query = url.searchParams.get('query');
      const start_date = url.searchParams.get('start_date');
      const end_date = url.searchParams.get('end_date');

      if (!query || query.length < 1 || query.length > 200) {
        return errorResponse(400, 'query required (1-200 chars)');
      }

      const params: any = { query };
      if (start_date) params.startDate = start_date;
      if (end_date) params.endDate = end_date;

      const d = await teamup.call(settings, 'GET', 'events', { params });
      return jsonResponse((d.events || []).map(slim));
    }

    // Calendar changed
    if (pathname === '/calendar/changed' && method === 'GET') {
      await requireScope('calendar:read')(request, settings);
      const modified_since = url.searchParams.get('modified_since');

      if (!modified_since) {
        return errorResponse(400, 'modified_since required');
      }

      const d = await teamup.call(settings, 'GET', 'events', {
        params: { modifiedSince: modified_since },
      });

      return jsonResponse({
        timestamp: d.timestamp,
        events: (d.events || []).map(slim),
      });
    }

    // Create event
    if (pathname === '/calendar/events' && method === 'POST') {
      await requireScope('calendar:write')(request, settings);
      const body = await request.json();
      const subs =
        body.subcalendar_ids ||
        (settings.teamup_default_subcalendar_id ? [settings.teamup_default_subcalendar_id] : null);

      if (!subs) {
        return errorResponse(422, 'subcalendar_ids required (no default configured)');
      }

      const eventBody = {
        subcalendar_ids: subs,
        title: body.title,
        notes: body.notes,
        location: body.location,
        who: body.who,
        all_day: body.all_day || false,
        signup_enabled: false,
        comments_enabled: false,
        start_dt: new Date(body.start).toISOString(),
        end_dt: new Date(body.end).toISOString(),
      };

      const d = await teamup.call(settings, 'POST', 'events', { json: eventBody });
      return new Response(JSON.stringify(slim(d.event || {})), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete event
    if (pathname.match(/^\/calendar\/events\/[0-9ridnew-]+$/) && method === 'DELETE') {
      await requireScope('calendar:write')(request, settings);
      const event_id = pathname.split('/').pop();
      await teamup.call(settings, 'DELETE', `events/${event_id}`);
      return new Response(null, { status: 204 });
    }

    // Update event
    if (pathname.match(/^\/calendar\/events\/[0-9ridnew-]+$/) && method === 'PATCH') {
      await requireScope('calendar:write')(request, settings);
      const event_id = pathname.split('/').pop();
      const patch = await request.json();
      const cur = (await teamup.call(settings, 'GET', `events/${event_id}`)).event || {};

      const changes: any = {};
      if ('title' in patch) changes.title = patch.title;
      if ('notes' in patch) changes.notes = patch.notes;
      if ('location' in patch) changes.location = patch.location;
      if ('who' in patch) changes.who = patch.who;
      if ('all_day' in patch) changes.all_day = patch.all_day;
      if ('subcalendar_ids' in patch) changes.subcalendar_ids = patch.subcalendar_ids;
      if ('start' in patch) changes.start_dt = new Date(patch.start).toISOString();
      if ('end' in patch) changes.end_dt = new Date(patch.end).toISOString();

      Object.assign(cur, changes);

      const body: any = {};
      for (const k of WRITABLE) {
        if (k in cur) body[k] = cur[k];
      }

      if (patch.redit) body.redit = patch.redit;

      const d = await teamup.call(settings, 'PUT', `events/${event_id}`, { json: body });
      return jsonResponse(slim(d.event || {}));
    }

    // Import iCal
    if (pathname === '/calendar/import' && method === 'POST') {
      await requireScope('calendar:write')(request, settings);
      const body = await request.json();
      const subs =
        body.subcalendar_ids ||
        (settings.teamup_default_subcalendar_id ? [settings.teamup_default_subcalendar_id] : null);

      if (!subs) {
        return errorResponse(422, 'subcalendar_ids required (no default configured)');
      }

      if (body.ics.length > 2_000_000) {
        return errorResponse(413, 'iCal too large');
      }

      let events;
      try {
        events = ical.parseIcs(body.ics);
      } catch (e) {
        return errorResponse(422, e instanceof Error ? e.message : String(e));
      }

      if (body.dry_run) {
        return jsonResponse({ parsed: events.length, events });
      }

      let created = 0;
      const failed: string[] = [];

      for (const ev of events) {
        try {
          await teamup.call(settings, 'POST', 'events', {
            json: {
              ...ev,
              subcalendar_ids: subs,
              signup_enabled: false,
              comments_enabled: false,
            },
          });
          created++;
        } catch {
          failed.push(ev.title);
        }
      }

      return jsonResponse({ parsed: events.length, created, failed });
    }

    // Recent changes
    if (pathname === '/calendar/changes' && method === 'GET') {
      await requireScope('calendar:read')(request, settings);
      const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '50'), 200));
      return jsonResponse(changeLog.getRecent(limit));
    }

    // Teamup webhook
    if (pathname === '/webhooks/teamup' && method === 'POST') {
      const raw = await request.arrayBuffer();
      const signature = request.headers.get('teamup-signature') || '';

      if (!settings.teamup_webhook_secret || !signatureOk(settings.teamup_webhook_secret, raw, signature)) {
        return errorResponse(401, 'Invalid signature');
      }

      const text = new TextDecoder().decode(raw);
      let p;
      try {
        p = JSON.parse(text);
      } catch {
        return errorResponse(400, 'Invalid JSON');
      }

      const msg_id = p.id;
      if (msg_id !== undefined && changeLog.hasById(msg_id)) {
        return jsonResponse({ ok: true });
      }

      const d = p.dispatch || {};
      changeLog.add({
        id: msg_id,
        received_at: new Date().toISOString(),
        trigger: d.trigger,
        event: d.event,
      });

      return jsonResponse({ ok: true });
    }

    // 404
    return new Response('Not found', { status: 404 });
  } catch (error) {
    return handleError(error);
  }
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
};
