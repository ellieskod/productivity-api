import crypto from 'node:crypto';

export interface Agent {
  key_sha256: string;
  scopes: string[];
}

export interface Settings {
  agent_keys: Record<string, Agent>;
  teamup_calendar_key: string;
  teamup_api_key: string;
  teamup_default_subcalendar_id: number | null;
  teamup_webhook_secret: string;
}

export function getSettings(env: Env): Settings {
  return {
    agent_keys: parseAgentKeys(env.AGENT_KEYS || '{}'),
    teamup_calendar_key: env.TEAMUP_CALENDAR_KEY || '',
    teamup_api_key: env.TEAMUP_API_KEY || '',
    teamup_default_subcalendar_id: env.TEAMUP_DEFAULT_SUBCALENDAR_ID ? parseInt(env.TEAMUP_DEFAULT_SUBCALENDAR_ID) : null,
    teamup_webhook_secret: env.TEAMUP_WEBHOOK_SECRET || '',
  };
}

function parseAgentKeys(json: string): Record<string, Agent> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export async function authenticate(
  request: Request,
  settings: Settings
): Promise<[string, Agent]> {
  const authHeader = request.headers.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new HTTPException(401, 'Missing bearer token');
  }

  const digest = crypto.createHash('sha256').update(token).digest('hex');

  for (const [name, agent] of Object.entries(settings.agent_keys)) {
    if (timingSafeEqual(digest, agent.key_sha256.toLowerCase())) {
      return [name, agent];
    }
  }

  throw new HTTPException(401, 'Invalid token');
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function requireScope(scope: string) {
  return async (request: Request, settings: Settings): Promise<string> => {
    const [name, agent] = await authenticate(request, settings);
    if (!agent.scopes.includes(scope)) {
      throw new HTTPException(403, 'Missing scope: ' + scope);
    }
    return name;
  };
}

export class HTTPException extends Error {
  constructor(public status: number, public message: string) {
    super(message);
  }
}
