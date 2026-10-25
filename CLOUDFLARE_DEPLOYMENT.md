# Cloudflare Worker Deployment Guide

This application has been converted from a Railway deployment to a Cloudflare Worker for serverless execution.

## Prerequisites

- A Cloudflare account
- Node.js 18+ installed
- `npm` or `yarn` package manager

## Setup & Deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.wrangler.env` file or use the Cloudflare dashboard to set environment variables:

```
AGENT_KEYS={"agent_name": {"key_sha256": "hash_of_token", "scopes": ["calendar:read", "calendar:write"]}}
TEAMUP_CALENDAR_KEY=your_calendar_key
TEAMUP_API_KEY=your_api_key
TEAMUP_DEFAULT_SUBCALENDAR_ID=12345
TEAMUP_WEBHOOK_SECRET=your_webhook_secret
```

### 3. Local Development

Run the worker locally for testing:

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`

### 4. Deploy to Cloudflare

Deploy to your Cloudflare Workers account:

```bash
npm run deploy
```

### 5. Configure Custom Domain (Optional)

Update `wrangler.toml` with your custom domain:

```toml
[env.production]
routes = [
  { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

## Key Differences from Railway

- **No Python runtime**: The entire app is now TypeScript/JavaScript
- **In-memory storage**: The change log is in-memory (cleared on redeploy)
- **Serverless**: No persistent processes, scales automatically
- **No filesystem**: All configuration via environment variables
- **Faster cold starts**: Cloudflare Workers are optimized for sub-100ms startup

## API Endpoints

All endpoints remain the same as the original FastAPI application:

- `GET /health` - Health check
- `GET /calendar/subcalendars` - List calendars
- `GET /calendar/events` - List events
- `GET /calendar/search` - Search events
- `GET /calendar/changed` - Get changed events since timestamp
- `POST /calendar/events` - Create event
- `PATCH /calendar/events/{id}` - Update event
- `DELETE /calendar/events/{id}` - Delete event
- `POST /calendar/import` - Import iCal events
- `GET /calendar/changes` - Get recent webhook notifications
- `POST /webhooks/teamup` - Receive Teamup webhooks

## Authentication

All calendar endpoints require a bearer token with appropriate scopes:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.yourdomain.com/calendar/events?start_date=2024-01-01&end_date=2024-12-31
```

## Troubleshooting

### 401 Invalid Token

Ensure your token's SHA256 hash is correctly configured in `AGENT_KEYS`. Generate the hash with:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('your-token').digest('hex'))"
```

### 503 Teamup not configured

Check that `TEAMUP_CALENDAR_KEY` and `TEAMUP_API_KEY` environment variables are set.

### Memory/Change Log Issues

The change log is in-memory and limited to 200 entries. For persistent event tracking, use the `/calendar/changed` endpoint with `modified_since` timestamps.

## Performance Notes

- Cloudflare Workers have a 30-second execution limit per request
- Maximum request body size is typically 100MB
- Network requests use fetch API (native support)
- No database connection pooling needed - each request is isolated

## Monitoring

Monitor your worker in the Cloudflare dashboard under:
- Workers & Pages > Your Worker > Analytics
- Check real-time logs under the "Logs" tab
