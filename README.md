# Productivity API

An open-source gateway for automating personal planning, organizing projects, and enabling AI agents to interact with productivity tools—all while prioritizing **privacy and security**.

## idea

Productivity API aims to be a secure, privacy-first hub for:

- **Personal & Project Automation**: Automate planning, scheduling, and organization tasks
- **Agent Integration**: Allow AI agents to interact with productivity tools via scoped API access (not holding real credentials)
- **Extensible Integrations**: Iteratively add support for more services (Teamup, Google Calendar, Notion, GitHub Issues, etc.)
- **Privacy by Design**: 
  - Agents authenticate with bearer tokens, each with granular scopes (`calendar:read`, `calendar:write`)
  - Potentially support self hosted LLM's and LLM's over API.
  - Real credentials never leave server-side environment
  - SHA-256 token hashes stored (never plaintext)
  - Audit trail of agent actions via webhook notifications

##  Architecture

A lightweight gateway/proxy that sits between agents and third-party services:

```
Agent → Bearer Token → Productivity API → Service Credentials (kept private)
```

Benefits:
- Agents don't need access to real API keys
- Scopes limit what each agent can do
- All credentials in environment variables only
- Easy audit logging and revocation

## Quick Start

### Local Development (Python)

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Cloudflare Workers Deployment (TypeScript)

```bash
npm install
npm run dev          # Local testing
npm run deploy       # Deploy to Cloudflare
```

See [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md) for detailed setup.

## 📋 Calendar API Endpoints

### Read Operations
- `GET /health` - Health check
- `GET /calendar/subcalendars` - List available calendars
- `GET /calendar/events?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` - List events in date range
- `GET /calendar/search?query=...&start_date=...&end_date=...` - Full-text search events
- `GET /calendar/changed?modified_since=<unix_timestamp>` - Durable sync (returns timestamp for next poll)
- `GET /calendar/changes?limit=50` - Recent webhook notifications (in-memory, use `/changed` for persistence)

### Write Operations
- `POST /calendar/events` - Create event
- `PATCH /calendar/events/{id}` - Update event (title, location, dates, etc.)
- `DELETE /calendar/events/{id}` - Delete event
- `POST /calendar/import` - Bulk import iCal events (with dry-run mode)

### Webhook
- `POST /webhooks/teamup` - Receive Teamup notifications (signature verified)

##  Authentication & Authorization

All endpoints (except `/health`) require:

```bash
Authorization: Bearer YOUR_TOKEN
```

Tokens are scoped. Example `AGENT_KEYS` configuration:

```json
{
  "my-agent": {
    "key_sha256": "abc123...",
    "scopes": ["calendar:read", "calendar:write"]
  }
}
```

Generate token hash:

```bash
# Python
python gen_key.py

# TypeScript/Node
node gen_cloudflare_key.js YOUR_TOKEN
```

## ⚙️ Configuration

### Environment Variables

```bash
# Agent credentials (JSON)
AGENT_KEYS='{"agent_name": {"key_sha256": "...", "scopes": [...]}}'

# Teamup calendar service
TEAMUP_CALENDAR_KEY=your_calendar_key
TEAMUP_API_KEY=your_api_key
TEAMUP_DEFAULT_SUBCALENDAR_ID=12345
TEAMUP_WEBHOOK_SECRET=your_webhook_secret
```

See `.env.example` (Python) or `.env.cloudflare` (TypeScript) for templates.

##  Adding New Integrations

To add support for a new service:

1. **Create a new module** (e.g., `src/google-calendar.ts` or `app/google_calendar.py`)
2. **Define service-specific types** (events, tasks, etc.)
3. **Add endpoints** to main handler (e.g., `/google-calendar/events`)
4. **Define new scopes** (e.g., `google-calendar:read`, `google-calendar:write`)
5. **Update configuration** with service credentials
6. **Add tests** for the integration

See existing Teamup implementation as a template.

##  Current Features

### Calendar Integration (Teamup)
- List, search, create, update, delete events
- Bulk iCal import with dry-run
- Recurring event support (RRULE pass-through)
- Real-time webhook notifications
- Durable sync via timestamps
- Multiple subcalendars

### Coming Soon
- Google Calendar integration
- Notion integration
- GitHub Issues integration
- Email integration
- Task management (todos, habits, time tracking)
- Note-taking integration
- Project management
- Agentic behaviour in the API 

## Privacy & Security

- **No data storage**: Events pass through; never persisted by the gateway
- **Credential isolation**: Each agent token has minimal necessary permissions
- **Webhook verification**: HMAC-SHA256 signature validation
- **Audit logging**: Recent changes available via `/calendar/changes`
- **HTTPS-only**: Always deployed with TLS
- **Open source**: Transparent, auditable code
- **Stateless**: Each request is isolated; no shared state between requests

## Documentation

- [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md) - Deploy to Cloudflare Workers
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Railway → Cloudflare migration details
- `.env.example` - Python environment template
- `.env.cloudflare` - TypeScript/Cloudflare environment template

## Testing

### Python
```bash
pytest
```

### TypeScript
```bash
npm run dev
# Test endpoints with curl or Postman
```

## Philosophy

Productivity API is built on these principles:

1. **Privacy First**: Your credentials never leave the server. Agents authenticate with scoped tokens.
2. **Minimal Surface Area**: Agents only get access to what they need.
3. **Interoperability**: Support multiple services and allow easy composition.
4. **Transparency**: Open source, auditable, no hidden behavior.
5. **Simplicity**: Lightweight, easy to understand and extend.
6. **User Control**: You own your data and your agent credentials.

## Contributing

Contributions welcome! Areas of focus:

- New service integrations (Google Calendar, Notion, GitHub, etc.)
- Enhanced authentication/authorization schemes
- Better audit logging and analytics
- Performance optimizations
- Improved error handling and validation
- Additional test coverage
- Documentation improvements
- Agentic directly in the API with free choice LLM. Schedule LLM in environment with instructions for using the API. 
- UI for customization and setup

## License

MIT
