# Secunova API

Backend for the Secunova platform: authentication, dashboard data, and the AI Security Copilot.
Node.js + Express + PostgreSQL + Redis, matching the stack in the original project spec.

Tested end-to-end locally: register/login, dashboard endpoints, incident status updates, and a
full copilot chat session all work against a real Postgres + Redis instance.

## Stack

- **Express** — REST API
- **PostgreSQL** (via `pg`, raw SQL — no ORM engine binaries to download, so it runs anywhere)
- **Redis** — short-lived caching for dashboard stats + rate limiting
- **JWT** — auth (`jsonwebtoken` + `bcryptjs` for password hashing)
- **OpenAI API** — real Copilot answers when `OPENAI_API_KEY` is set; falls back to a clearly-labeled
  mock response otherwise, so the whole flow is testable without a key

## Setup

```bash
npm install

# Postgres + Redis — either run locally or:
docker compose up -d

cp .env.example .env
# edit .env: set DATABASE_URL / REDIS_URL to match your setup, and set a real JWT_SECRET

npm run db:migrate   # creates tables
npm run db:seed      # creates a demo org + user + sample alerts/incidents/threat data

npm run dev          # nodemon, or `npm start` for plain node
```

Demo login after seeding: `demo@secunova.ai` / `DemoPass123!`

Health check: `GET /health`

## API reference

All routes except `/health`, `/api/auth/register`, and `/api/auth/login` require:
`Authorization: Bearer <token>`

### Auth
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Create a new organization + first admin user |
| POST | `/api/auth/login` | Log in, returns a JWT |
| GET | `/api/auth/me` | Current user + organization |

### Dashboard
| Method | Route | Description |
|---|---|---|
| GET | `/api/dashboard/overview` | Security score, risk level, protected devices, active incidents |
| GET | `/api/dashboard/alerts?limit=10` | Recent alerts |
| GET | `/api/dashboard/timeline` | Detected vs. blocked attacks, hourly buckets, last 24h |
| GET | `/api/dashboard/threat-map` | Recent geolocated threat events for the live map |
| GET | `/api/dashboard/cloud-assets` | Coverage % by cloud provider |
| GET | `/api/dashboard/incidents` | All incidents |
| PATCH | `/api/dashboard/incidents/:id` | Update incident status (`OPEN`, `IN_REVIEW`, `CONTAINED`, `RESOLVED`) |

### AI Copilot
| Method | Route | Description |
|---|---|---|
| POST | `/api/copilot/sessions` | Start a new chat session |
| POST | `/api/copilot/sessions/:id/messages` | Send a message, get the AI's reply (grounded in recent alerts) |
| GET | `/api/copilot/sessions/:id/messages` | Full message history for a session |

## Notes on scope

This covers the core product loop from the spec (auth, dashboard data, AI copilot) with real
persistence and a working AI integration path. Not yet built: cloud provider scanning integrations
(AWS/Azure/GCP/Oracle live APIs), endpoint agent ingestion, and the separate admin panel — those are
substantial standalone integrations best scoped one at a time. The schema (`db/schema.sql`) already
has the tables needed to extend into those areas.

## Connecting the frontend

The `secunova.html` landing page + dashboard mockup is fully static right now. To wire it up:
1. Replace the mock JS data in the dashboard section with `fetch()` calls to these endpoints
2. Store the JWT from `/api/auth/login` (e.g. in memory or a cookie) and send it as
   `Authorization: Bearer <token>` on each request
3. Point the AI chat's "Replay" button at `POST /api/copilot/sessions/:id/messages`

## Security notes for production

- Set a strong, random `JWT_SECRET` and rotate it if it's ever exposed
- Put this behind HTTPS; never send the JWT over plain HTTP
- Tighten CORS (`cors()` currently allows all origins) to your actual frontend domain
- Consider shorter-lived access tokens + refresh tokens for production use
