# Monitoring Dashboard with AI Insights

Real-time HTTP monitoring with LLM-powered incident analysis. Built for the BizScout take-home assessment.

## What it does

Pings `httpbin.org/anything` every 5 minutes with a randomly generated JSON payload, stores the response in MongoDB, and pushes updates to the browser via Socket.io. When a response time spikes above 2x the rolling average, it automatically generates an incident report using Claude — root cause analysis and actionable recommendations. There's also a chat widget for querying the monitoring data in plain English.

## Running locally

**Backend**
```
cd backend
npm install
npm start
```
Set `CLAUDE_API_KEY` and `MONGODB_URI` as environment variables before starting.

**Frontend**
```
cd frontend
npm install
npm run dev
```

## Live deployment

- Frontend (Vercel) — -
- Backend (Railway) — -

## Tech choices

- **Node.js + Express** — lightweight, good fit for a JSON API with real-time needs
- **MongoDB** — response payloads and AI-generated text don't fit neatly into a relational schema; Mongo avoids schema migrations while prototyping
- **Socket.io** — simplest way to push updates to the browser without polling
- **Claude Haiku 4.5** — picked specifically for cost. At ~$0.25/1M input tokens it's cheap enough to stay well under budget even at the 20 calls/hour cap. Haiku handles structured analysis like this fine.
- **Vanilla CSS** — no time to fight a component library

## AI Enhancement — Option B

### Natural Language Query
Chat widget in the bottom-right. Users can ask things like "What was the slowest request today?" or "Any patterns in the payload data?" The system passes the last 15 response records — including the sent payload and httpbin's echo — to Claude and returns a conversational answer. The payload data is included so the LLM can actually answer questions about response content, not just latency numbers.

### Automatic Incident Reporting
Whenever a response time exceeds 2x the rolling average of the last 20 requests, the system fires off a Claude call with the endpoint details, the anomalous response time, and the request payload. Claude returns a structured JSON with a root cause and a list of recommendations, which gets stored in MongoDB and shown in the Incidents tab.

The 2x threshold is intentionally conservative — low enough to catch real spikes, but won't fire on minor fluctuations. Severity is `high` if the spike is 5x+ the average, `medium` otherwise.

### Cost Optimization

This was the part I thought about most carefully.

**Model choice**: Haiku 4.5 over Sonnet. A typical NL query prompt runs about 600–800 tokens input and 150–200 tokens output. At Haiku pricing that's roughly $0.0002–0.0004 per call. At the 20 calls/hour hard cap, worst case is about $0.008/hour — call it $6/month at full saturation, which never actually happens.

**Context trimming**: Originally passed 50 response records to the LLM. Cut to 15. Saves ~60% on input tokens per NL query with negligible loss in answer quality for the kinds of questions users actually ask.

**Caching**: 10-minute in-memory cache keyed by the exact query string. Duplicate questions within that window don't hit the API at all.

**Token counting**: Every call goes through `gpt-tokenizer` before it's made. Prompt and completion token counts are logged to a `TokenUsage` collection in MongoDB. The dashboard shows running total cost and tokens used.

**Rate limiting**: Hard cap of 20 LLM calls per hour. Tracked in-process with a rolling timestamp array. When exceeded, the API returns a clear error — the chat widget surfaces it to the user rather than silently failing.

**What's not done**: Streaming responses. The chat waits for the full response before rendering. Would add this next — it's a `stream: true` flag on the Anthropic SDK call and SSE on the frontend, but felt like polish rather than core functionality for the assessment scope.

## Database schema

**Response** — timestamp, method, endpoint, statusCode, responseTime, payload, responseBody, tags

**Incident** — timestamp, severity, endpoint, responseTime, averageResponseTime, rootCause, recommendations[], isResolved

**TokenUsage** — promptTokens, completionTokens, totalTokens, estimatedCost, action

## Testing

Chose the **backend API and service layer** as the core component to test. That's where the meaningful logic lives — anomaly thresholds, rate limiting, caching — and it's the part most likely to break silently.

- `src/services/ai.service.test.js` — pricing calculation and rate limiter logic
- `src/routes/api.test.js` — integration tests for all four API endpoints using supertest; DB calls are mocked so no MongoDB needed
- `src/services/monitor.service.test.js` — anomaly detection threshold logic (does it fire at 2x? does it skip with fewer than 5 data points?)

12 tests total. CI (GitHub Actions) runs lint + tests + coverage on every push and uploads the lcov report as an artifact.

The frontend has no tests. Given the time constraints I prioritised the backend service layer — that's where the non-trivial logic is. Adding React Testing Library tests for the dashboard components would be the obvious next step.

## Assumptions

- Baseline for anomaly detection is the last 20 requests (not a time window). Simple to change but good enough for the scope here.
- The 10-minute query cache is in-process — restarts clear it. A Redis cache would fix this but felt like over-engineering.
- Single endpoint monitored (`httpbin.org/anything`). The schema supports multiple endpoints if needed.

## Future improvements

- Persistent cache (Redis) so restarts don't lose cached responses
- Streaming chat responses
- Multi-endpoint monitoring with per-endpoint alert thresholds
- Auto-tagging and categorisation of response payloads
- Frontend component tests
