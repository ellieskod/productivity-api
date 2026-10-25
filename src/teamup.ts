import { Settings, HTTPException } from './auth';

const BASE = 'https://api.teamup.com';

export async function call(
  s: Settings,
  method: string,
  path: string,
  options: RequestInit & { params?: Record<string, any>; json?: any } = {}
): Promise<any> {
  if (!s.teamup_calendar_key || !s.teamup_api_key) {
    throw new HTTPException(503, 'Teamup not configured');
  }

  let url = `${BASE}/${s.teamup_calendar_key}/${path.replace(/^\//, '')}`;

  if (options.params) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    }
    if (params.toString()) {
      url += '?' + params.toString();
    }
  }

  const headers: Record<string, string> = {
    'Teamup-Token': s.teamup_api_key,
    ...(options.headers as Record<string, string>),
  };

  if (options.json) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    ...(options.json && { body: JSON.stringify(options.json) }),
  };

  try {
    const response = await fetch(url, fetchOptions);
    if (response.status >= 400) {
      throw new HTTPException(502, `Teamup error (${response.status})`);
    }
    if (!response.headers.get('content-length') || response.headers.get('content-length') === '0') {
      return {};
    }
    return response.json();
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(502, 'Teamup request failed');
  }
}
