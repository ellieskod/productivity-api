# Migration from Railway to Cloudflare Workers

This guide details the conversion of the productivity-api from a Railway (Python FastAPI) deployment to a Cloudflare Workers (TypeScript) deployment.

## What Changed

### Technology Stack

| Aspect | Railway | Cloudflare Workers |
|--------|---------|-------------------|
| Runtime | Python 3.x | Node.js (built-in) |
| Framework | FastAPI | Native Fetch API |
| Language | Python | TypeScript |
| Deployment | Container-based | Serverless Edge |
| Scalability | Manual | Automatic global |
| Cold Start | ~1-2s | ~10-50ms |

### File Structure

**Before (Python/FastAPI):**
```
productivity-api/
├── app/
│   ├── main.py       # FastAPI application
│   ├── auth.py       # Authentication logic
│   ├── config.py     # Configuration
│   ├── teamup.py     # Teamup API client
│   └── ical.py       # iCal parser
├── railway.json      # Railway config
└── Procfile          # Start command
```

**After (TypeScript/Cloudflare):**
```
productivity-api/
├── src/
│   ├── index.ts      # Main worker handler
│   ├── auth.ts       # Authentication logic
│   ├── teamup.ts     # Teamup API client
│   └── ical.ts       # iCal parser
├── wrangler.toml     # Cloudflare config
├── package.json      # Node.js dependencies
└── tsconfig.json     # TypeScript config
```

## Code Changes

### Authentication

**Python (FastAPI):**
```python
@app.get("/health")
def health():
    return {"status": "ok"}

def authenticate(
    authorization: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> tuple:
    # Token validation logic
```

**TypeScript (Cloudflare Workers):**
```typescript
// Health check endpoint
if (pathname === '/health' && method === 'GET') {
  return jsonResponse({ status: 'ok' });
}

// Authentication
export async function authenticate(
  request: Request,
  settings: Settings
): Promise<[string, Agent]> {
  // Token validation logic
}
```

### API Calls

**Python (httpx):**
```python
async def call(s: Settings, method: str, path: str, **kw):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.request(method, url, ...)
```

**TypeScript (fetch):**
```typescript
export async function call(
  s: Settings,
  method: string,
  path: string,
  options = {}
): Promise<any> {
  const response = await fetch(url, fetchOptions);
}
```

### Routing

**Python (FastAPI):**
```python
@cal.get("/events")
async def list_events(...):
    # Handler logic

app.include_router(cal)
```

**TypeScript (URL-based):**
```typescript
if (pathname === '/calendar/events' && method === 'GET') {
  // Handler logic
}
```

## Deployment Instructions

### 1. Prerequisites

```bash
npm install -g wrangler
```

### 2. Configure Wrangler

```bash
wrangler login
```

### 3. Set Environment Variables

Create `.wrangler.env` or use Cloudflare dashboard:

```bash
wrangler secret put TEAMUP_CALENDAR_KEY
wrangler secret put TEAMUP_API_KEY
wrangler secret put TEAMUP_WEBHOOK_SECRET
wrangler secret put AGENT_KEYS
```

### 4. Deploy

```bash
npm run deploy
```

## Performance Improvements

1. **Faster Cold Starts**: ~10-50ms vs ~1-2s
2. **Global Distribution**: Automatically deployed to Cloudflare's global network
3. **Reduced Latency**: Requests served from nearest edge location
4. **Automatic Scaling**: No capacity planning needed
5. **Lower Cost**: Pay-per-request pricing

## Behavioral Changes

1. **In-Memory Storage**: Change log cleared on redeploy (use `/calendar/changed` for persistence)
2. **Request Timeout**: 30-second maximum execution time
3. **No Filesystem**: Configuration entirely through environment variables
4. **Execution Model**: Stateless, isolated per request

## Breaking Changes

None - all API endpoints remain identical.

## Testing the Migration

### Local Testing

```bash
npm run dev
# Worker runs on http://localhost:8787
```

### Test Health Endpoint

```bash
curl http://localhost:8787/health
# Response: {"status":"ok"}
```

### Test with Token

```bash
# Generate a token hash
node gen_cloudflare_key.js my-test-token

# Set environment
export AGENT_KEYS='{"test":{"key_sha256":"...","scopes":["calendar:read"]}}'

# Test authentication
curl -H "Authorization: Bearer my-test-token" \
  http://localhost:8787/calendar/subcalendars
```

## Troubleshooting

### Issue: 503 Teamup not configured
**Solution**: Verify `TEAMUP_CALENDAR_KEY` and `TEAMUP_API_KEY` are set in environment variables.

### Issue: 401 Invalid token
**Solution**: Ensure token SHA256 hash is correctly configured. Use `gen_cloudflare_key.js` to generate it.

### Issue: Slow response times
**Solution**: Check if Teamup API is responding. Use Cloudflare dashboard to view worker logs.

### Issue: Change log not persisting
**Solution**: This is expected - change log is in-memory. Use `/calendar/changed` endpoint for durable sync.

## Rollback Plan

If needed, you can quickly rollback to Railway:

1. Railway deployment still has your Git history
2. Set Railway as default deployment in GitHub
3. Previous builds are cached on Railway

## Cost Comparison

- **Railway**: Fixed monthly cost + overages
- **Cloudflare Workers**: $0.30 per 1M requests (free tier: 100K/day)

For typical usage patterns, Cloudflare is significantly cheaper.

## Next Steps

1. Update DNS to point to Cloudflare Workers
2. Configure custom domain in `wrangler.toml`
3. Monitor via Cloudflare dashboard
4. Set up alerts for errors
5. Consider adding KV storage for persistent change log (future enhancement)

## Support

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [TypeScript Support](https://developers.cloudflare.com/workers/languages/typescript/)
