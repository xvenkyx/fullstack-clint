# Interview Guide — Monitoring Dashboard with AI Insights

> This guide is written assuming you have **zero prior context** about this codebase. Read it end to end before the interview. The first half explains what the system does and every meaningful decision made while building it. The second half is a list of questions that are likely to come up, with thorough answers you can speak to confidently.

---

## Part 1 — Codebase Walkthrough

---

### 1.1 What This Project Is

This is a **real-time HTTP monitoring dashboard** built as a take-home engineering assessment for BizScout. The application does the following automatically, continuously, with no user interaction required:

1. Every 5 minutes, it sends an HTTP POST to `httpbin.org/anything` with a randomly generated JSON payload.
2. It records the response (status code, response time, payload, echo body) to a MongoDB database.
3. It pushes that record live to any open browser tabs via WebSockets.
4. If the response time spikes above **2× the rolling average** of the last 20 requests, it calls the Claude AI API to automatically generate an incident report (root cause + recommendations), stores it, and pushes it live to the browser too.
5. There is a **chat widget** in the bottom-right of the UI where a user can ask natural language questions about the monitoring data (e.g. "What was the slowest request today?") and get a conversational AI answer.

The project has **three AI integration points**: automatic incident reporting, natural language querying, and cost tracking (every LLM call's token usage and estimated dollar cost is logged to the database and shown on the dashboard).

---

### 1.2 Tech Stack — What Was Used and Why

| Layer | Technology | Why |
|---|---|---|
| Backend runtime | Node.js + Express v5 | Lightweight, ideal for JSON APIs, async-first |
| Database | MongoDB (via Mongoose) | Response payloads and AI text don't fit neatly into relational tables; avoids migrations while prototyping |
| Real-time | Socket.io | Simplest way to push data to the browser without polling; persistent WebSocket |
| AI | Claude Haiku 4.5 | Cheapest capable model; structured extraction and factual summarisation don't need strong reasoning |
| Token counting | `gpt-tokenizer` | Count tokens *before* the API call to log cost estimates in real time |
| Scheduler | `node-cron` | Runs the 5-minute ping on a cron expression inside the Node process |
| HTTP client | `axios` | Sends the monitored POST request to httpbin |
| Frontend | React + Vite | Standard SPA setup; fast dev builds |
| Styling | Vanilla CSS | No time to configure and fight a component library |
| Testing | Node.js built-in test runner + `supertest` + `c8` | No extra test framework dependency; supertest for HTTP integration; c8 for coverage |
| CI | GitHub Actions | Lint + test + coverage on every push |
| Frontend hosting | Vercel | Free tier, instant deploys from GitHub |
| Backend hosting | Railway | Persistent Node process required for Socket.io (Vercel is serverless — can't do WebSockets) |

---

### 1.3 Repository Structure

```
fullstack-clint/
├── README.md                    ← Setup, tech choices, AI details, cost analysis, assumptions
├── ENGINEERING_NOTES.md         ← Design decisions and reasoning, written informally
├── TESTING_DECISIONS.md         ← Why specific tests were chosen, what was skipped and why
│
├── backend/
│   ├── package.json
│   └── src/
│       ├── server.js            ← Entry point: HTTP server, Socket.io, MongoDB, starts monitor
│       ├── app.js               ← Express app: middleware (CORS, JSON), mounts routes
│       ├── routes/
│       │   └── api.js           ← 4 REST endpoints
│       ├── models/
│       │   ├── response.model.js
│       │   ├── incident.model.js
│       │   └── tokenUsage.model.js
│       └── services/
│           ├── monitor.service.js        ← Ping scheduler + anomaly detection
│           ├── monitor.service.test.js
│           ├── ai.service.js             ← LLM calls, caching, rate limiting, cost tracking
│           ├── ai.service.test.js
│           ├── api.test.js               ← Integration tests for all 4 endpoints
│
└── frontend/
    └── src/
        ├── App.jsx              ← Tab router (Dashboard | Incidents) + ChatWidget overlay
        └── components/
            ├── Dashboard.jsx    ← Real-time response table + stats cards
            ├── Incidents.jsx    ← Incident list with LLM analysis
            └── ChatWidget.jsx   ← Collapsible chat UI, markdown rendering
```

---

### 1.4 How Data Flows — End to End

```
node-cron (every 5 min)
    │
    ▼
monitor.service.js → ping()
    │   POST https://httpbin.org/anything  { id, timestamp, metadata }
    │   Measure response time (ms)
    │   Save → ResponseModel (MongoDB)
    │   Emit → Socket.io "new_response"
    │
    ▼
checkForAnomalies(newRecord)
    │   Query last 21 records from DB
    │   If < 5 records → skip (no baseline yet)
    │   Calculate avg of last 20
    │   If responseTime > avg * 2 → trigger AI
    │
    ▼ (only on anomaly)
ai.service.js → generateIncidentReport()
    │   Check rate limit (20 calls/hr max)
    │   Build prompt (endpoint, responseTime, payload, status)
    │   Call Claude Haiku 4.5 → JSON { rootCause, recommendations[] }
    │   Set severity: "high" if > 5x avg, "medium" otherwise
    │   Save → IncidentModel (MongoDB)
    │   Log tokens/cost → TokenUsageModel
    │   Emit → Socket.io "new_incident"
    │
    ▼ (browser)
Dashboard.jsx   ← listens "new_response" → adds row to table, updates stats
Incidents.jsx   ← listens "new_incident" → adds card with rootCause + recommendations
```

For natural language queries:

```
User types in ChatWidget
    │
    ▼
POST /api/query { query: "..." }
    │
    ▼
ai.service.js → queryData(userQuery)
    │   Check 10-minute in-memory cache (exact string match)
    │   If hit → return cached response (no API call)
    │   If miss:
    │     Check rate limit
    │     Fetch last 15 responses from DB
    │     Build prompt with data + user question
    │     Call Claude Haiku 4.5 → plain text answer
    │     Store in cache with timestamp
    │     Log tokens/cost → TokenUsageModel
    │
    ▼
ChatWidget renders markdown response via react-markdown
```

---

### 1.5 Database Models (MongoDB / Mongoose)

#### Response
Stored every time `httpbin.org` is pinged.

| Field | Type | Notes |
|---|---|---|
| timestamp | Date | Auto-set on save |
| method | String | e.g. `"POST"` |
| endpoint | String | e.g. `"https://httpbin.org/anything"` |
| statusCode | Number | e.g. `200` |
| responseTime | Number | Milliseconds |
| payload | Mixed | The random JSON sent in the request body |
| responseBody | Mixed | httpbin echoes back the full request — stored here |
| tags | [String] | Reserved for future categorisation, currently empty |

#### Incident
Created automatically when response time exceeds 2× average.

| Field | Type | Notes |
|---|---|---|
| timestamp | Date | |
| severity | String enum | `low / medium / high / critical` — only `medium` and `high` currently used |
| endpoint | String | |
| responseTime | Number | The anomalous value |
| averageResponseTime | Number | The baseline at time of detection |
| rootCause | String | LLM-generated analysis |
| recommendations | [String] | LLM-generated list |
| isResolved | Boolean | Default `false` — resolution flow not yet implemented |

#### TokenUsage
One record per LLM call. Powers the cost dashboard.

| Field | Type | Notes |
|---|---|---|
| timestamp | Date | |
| promptTokens | Number | From `gpt-tokenizer` before call |
| completionTokens | Number | From `gpt-tokenizer` after response |
| totalTokens | Number | Sum |
| estimatedCost | Number | USD, calculated with hardcoded pricing constants |
| action | String | `"natural_language_query"` or `"incident_report"` |

---

### 1.6 REST API — Four Endpoints

All mounted under `/api`.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/responses` | Returns last 100 responses, sorted newest first |
| `GET` | `/api/incidents` | Returns all incidents, sorted newest first |
| `POST` | `/api/query` | Accepts `{ query: "string" }`, calls AIService, returns AI response text |
| `GET` | `/api/stats` | Returns `{ totalCost, totalTokens }` aggregated from TokenUsage collection |

`POST /api/query` returns:
- `400` if body is missing or `query` field is absent
- `500` if AIService throws (typically means rate limit exceeded)
- `200 { response: "..." }` on success

All endpoints return `500 { error: "..." }` on unexpected failures.

---

### 1.7 AI Service — Key Details

**File**: [backend/src/services/ai.service.js](backend/src/services/ai.service.js)

This is the most technically interesting service. It wraps every Claude API call with:

#### Rate Limiting
A module-level array `callHistory` stores timestamps of every LLM call. Before each call, it filters out entries older than 1 hour. If 20 or more remain, the call is rejected and `checkRateLimit()` returns `false`. This is a **sliding window** rate limiter — it counts actual calls in the past 60 minutes, not a fixed hourly bucket.

**Known design smell**: The `callHistory` array lives in module scope, not as a class instance property. This makes it impossible to reset between unit test runs without reaching into the module internals, which is why the test tests the *logic pattern* in isolation rather than the actual module state.

#### In-Memory Cache
A `Map` object stores query results keyed by the exact query string, with the value being `{ response, timestamp }`. On every `queryData()` call, if the cache contains a matching key and the entry is less than 10 minutes old, the cached response is returned immediately — no API call, no cost. This is an **exact-match, time-to-live (TTL) cache**. Cache is lost on process restart (acknowledged limitation; Redis would fix it).

#### Token Counting
`gpt-tokenizer` encodes both the prompt and the response to count tokens. This library uses the same BPE tokenization algorithm as OpenAI/Anthropic models, so the count is a close approximation. The counts are used to calculate estimated cost using hardcoded pricing constants for Haiku 4.5. These constants are estimates — the exact Haiku 4.5 prices weren't clearly published when written, so they were extrapolated from Haiku 3 pricing.

#### Model Choice
`claude-haiku-4-5-20251001`. Chosen over Sonnet because:
- Both tasks (incident analysis and NL query) are structured extraction or factual summarisation — not complex reasoning
- Cost difference is ~5x at the same call volume
- At 20 calls/hour (hard cap), Haiku saturates at ~$6/month; Sonnet would be ~$30/month for a background monitoring tool

#### Severity Classification
In `generateIncidentReport()`:
- If `responseTime > averageResponseTime * 5` → severity = `"high"`
- Otherwise → severity = `"medium"`
- `"low"` and `"critical"` are defined in the schema but never assigned in current code

---

### 1.8 Monitor Service — Anomaly Detection Logic

**File**: [backend/src/services/monitor.service.js](backend/src/services/monitor.service.js)

The anomaly check in `checkForAnomalies(newRecord)`:

```
1. Query DB for the 21 most recent responses (including the new one)
2. If fewer than 5 → return (no baseline, don't fire false positives on startup)
3. Take the 20 previous responses (exclude the new one)
4. Calculate average of those 20
5. If newRecord.responseTime > average * 2 → call generateIncidentReport()
```

The 5-record minimum guard exists because on a fresh start, the first few pings have no meaningful history. Without the guard, the first request with any non-trivial latency would trigger a false incident. The threshold is exactly 2×, not "roughly" — the tests document this intent explicitly.

---

### 1.9 Real-Time Updates (Socket.io)

`server.js` creates an HTTP server, wraps it in a Socket.io server, and passes the `io` instance into `MonitorService.init(io)`. The monitor and AI services hold a reference to `io` and call `io.emit(eventName, data)` directly.

Two events:
- `"new_response"` — emitted after every successful ping, payload is the full response record
- `"new_incident"` — emitted after an incident is saved, payload is the full incident record

On the frontend, both `Dashboard.jsx` and `Incidents.jsx` connect to the Socket.io server on mount and register event listeners. Incoming events prepend the new record to local React state arrays.

---

### 1.10 Testing Strategy

**12 tests across 3 files. No frontend tests.**

The reasoning: the backend service layer contains the only non-trivial logic in the system. The frontend is mostly read-and-render. Dashboard and widget bugs would surface immediately during manual use; a miscalibrated anomaly threshold or a broken rate limit would fail silently.

#### monitor.service.test.js (3 tests)
Tests the `checkForAnomalies()` function directly by mocking the DB query return value.

- **< 5 records**: Guard fires, `generateIncidentReport` is NOT called. Prevents false positives on startup.
- **350ms vs 200ms avg**: Below 2× threshold (400ms), nothing fires. Documents that the threshold is exact, not approximate.
- **600ms vs 200ms avg**: Above 2× threshold, `generateIncidentReport` IS called with the specific new record object.

The third test asserts that the function was called *with the right argument* — not just that it was called. This matters if the service ever passes the wrong record or a mutated copy.

#### ai.service.test.js (2 tests)
Tests logic patterns in isolation.

- **Pricing arithmetic**: Verifies `(promptTokens × pricePerPrompt) + (completionTokens × pricePerCompletion)` computes correctly. Catches someone updating a pricing constant and forgetting to update the formula.
- **Rate limit logic**: Tests the filtering logic (timestamps older than 1 hour are excluded, count of remainder compared to 20) in isolation. Does NOT test the actual `callHistory` module state because it can't be reset between test runs — documented honestly as a compromise.

#### api.test.js (5 tests)
Integration tests using `supertest`. Hits the actual Express app with real HTTP requests. MongoDB and AIService are mocked.

- `GET /api/responses` — returns data correctly; returns 500 when DB throws
- `GET /api/incidents` — returns sorted data
- `POST /api/query` — returns 400 when body is missing; returns response on success; returns 500 when service throws

#### What Is Not Tested
- `callLLM()` — makes a live Anthropic API call. Testing it properly requires either mocking the Anthropic SDK or a real test API key. Mocking the SDK would test the mock, not the code.
- Cache hit/miss expiry in `queryData()` — the integration tests mock at a higher level so the 10-minute expiry logic is unverified.
- Frontend — no tests. React Testing Library for `ChatWidget` and `Incidents` is the obvious next step.

---

### 1.11 CI/CD Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main`.

**Backend job**:
1. Set up Node 20 with npm cache
2. `npm install`
3. `npm run lint` (ESLint)
4. `npm test` + `npm run coverage` (c8 via Node built-in test runner)
5. Upload coverage artifact

`CLAUDE_API_KEY=ci-placeholder` is set in the CI environment so the AIService constructor doesn't throw on missing env var. No actual API calls are made in tests.

**Frontend job**:
1. Set up Node 20
2. `npm install`
3. `npm run lint`
4. `npm run build` (Vite production build)

No frontend tests run in CI (none exist).

---

### 1.12 Deployment Architecture

```
Browser
  │  HTTP API calls
  │  WebSocket (Socket.io)
  ▼
Vercel (Frontend — Vite SPA)          Railway (Backend — Node.js persistent process)
  VITE_API_URL=<railway-url>   ←───→   PORT, CLAUDE_API_KEY, MONGODB_URI
                                        │
                                        ▼
                                   MongoDB (hosted, e.g. MongoDB Atlas)
```

**Why not Vercel for the backend?**  
Vercel uses a serverless model: each request spins up an isolated function that terminates after the response. Socket.io requires a *persistent* WebSocket connection — the socket must stay open between requests to push events. Serverless kills the connection after every invocation. Railway runs a standard persistent Node process, so WebSockets work natively.

---

### 1.13 Known Limitations and Acknowledged Trade-offs

These are explicitly called out in the engineering notes and are not gaps the author missed — they are intentional scope decisions for a time-boxed assessment.

| Limitation | Why accepted | What would fix it |
|---|---|---|
| In-memory cache cleared on restart | Redis felt like over-engineering for a demo | Redis with TTL |
| Rate limiter in module scope, not injected | Faster to write; acknowledged as design smell | Inject as constructor arg into AIService |
| No DB indexes | Demo scale doesn't need them | Index on `timestamp` for Response, Incident |
| No Mongoose field validation | Fine for prototyping | Add validators and required fields to schemas |
| Streaming chat not implemented | SSE + chunked render is polish, not core | `stream: true` on Anthropic SDK + SSE endpoint |
| Single endpoint monitored | Schema already supports multiple | Add per-endpoint threshold config |
| No frontend tests | Backend logic is the non-trivial part | React Testing Library for ChatWidget, Incidents |
| Haiku pricing constants are estimates | Exact Haiku 4.5 pricing wasn't clearly listed | Update from official Anthropic pricing page |
| Unused frontend packages | `recharts`, `framer-motion`, `lucide-react` installed but not used | Remove or implement |

---

## Part 2 — Interview Questions and Answers

---

### Q1. Walk me through the overall architecture of this system.

**Answer:**

The system has three layers: a React frontend, a Node.js/Express backend, and MongoDB.

The backend runs a cron job every 5 minutes that pings `httpbin.org/anything` with a random JSON payload, saves the result to MongoDB, and pushes the new record to connected browser clients over a WebSocket (Socket.io). If the response time is more than 2× the rolling average of the last 20 requests, it fires a Claude AI call to generate an incident report — root cause and recommendations — which also gets saved and pushed live to the browser.

The frontend has a Dashboard tab (live response table, stats), an Incidents tab (LLM-generated analysis cards), and a chat widget where users can ask natural language questions about the data.

The backend is deployed on Railway because Socket.io requires persistent connections — Vercel's serverless model would kill the WebSocket on every invocation. The frontend is on Vercel.

---

### Q2. Why did you pick MongoDB over a relational database like PostgreSQL?

**Answer:**

Three reasons.

First, the core data is schema-flexible. The `payload` field (random JSON sent to httpbin) and `responseBody` (httpbin's echo) are arbitrary nested objects. Storing those as `Mixed` in Mongoose is trivial; in PostgreSQL you'd either use a JSONB column (which works but loses type safety) or serialize to text (which loses queryability).

Second, the AI-generated fields — `rootCause` (free-form text) and `recommendations` (array of strings) — don't have fixed structure. Mongo's document model fits naturally.

Third, there are no relational queries in this application. There's no join between Response and Incident — they're independent collections. The relational model would add complexity without benefit here.

The trade-off: no referential integrity, no transactions, no field-level validation enforced at the DB layer (Mongoose validators are optional and bypassed by `save({ validateBeforeSave: false })`). For a production system, you'd add Mongoose validators and possibly use a relational DB if the query patterns evolved toward reporting across multiple dimensions.

---

### Q3. Why Socket.io for real-time updates? Why not polling or Server-Sent Events?

**Answer:**

**vs. polling**: Polling would work — `setInterval(() => fetchData(), 5000)` on the frontend. But it wastes requests, adds latency (you might poll between pings and get nothing), and doesn't scale cleanly if you add more event types. Socket.io pushes exactly when there's something new.

**vs. Server-Sent Events (SSE)**: SSE is a good fit for server-to-client streaming and is lighter than WebSockets. The reason Socket.io was chosen here is that it's already the standard tool for this pattern in the Node.js ecosystem, it handles reconnection automatically, and the same mechanism is used for both `new_response` and `new_incident` events. SSE is one-directional (server to client); Socket.io is bidirectional, which leaves the door open for client-to-server events if needed later.

The real practical constraint was deployment: Vercel serverless can't maintain either WebSockets or long-lived SSE connections. Railway was required regardless.

---

### Q4. Explain the anomaly detection logic. Why 2× the average? Why 20 previous requests?

**Answer:**

The threshold is 2× the rolling average of the last 20 requests. When a new response comes in, the service queries the 21 most recent records, excludes the new one, calculates the mean of the 20, and compares.

**Why 2×?** It's a conservative threshold — enough to ignore minor fluctuations (5% or 10% variance) but sensitive enough to flag a genuine spike. The explicit design intent is "low enough to catch real spikes, won't fire on minor fluctuations." The tests document that this is *exactly* 2×, not approximately.

**Why 20 requests?** It's a judgment call. 20 samples gives a reasonable baseline without being so large that the average is dominated by historical data that might not reflect current conditions. Time-window alternatives (e.g. "last 30 minutes") would have the problem of having very few data points if the system just started.

**Why a minimum of 5 records before checking?** On startup, the first few pings have no meaningful baseline. A 200ms response on the first request would compute an average of 200ms and then any slightly slower response would look like an anomaly. The guard prevents false positives during the warm-up period.

The limitation acknowledged in the notes: count-based windows can be misleading if requests are bunched in time. A time-window approach (average of last N minutes) would be more meaningful for production, but adds complexity for marginal benefit at this scale.

---

### Q5. How does the cost optimisation work for the AI integration?

**Answer:**

Four mechanisms:

**1. Model selection.** Haiku 4.5 instead of Sonnet. Both tasks (incident analysis and NL queries) are structured extraction or factual summarisation — not complex multi-step reasoning. Haiku handles them fine. The cost difference is roughly 5×: Haiku at 20 calls/hour saturates at ~$6/month; Sonnet would be ~$30/month for a background monitoring tool.

**2. Context trimming.** Originally the NL query prompt included 50 response records. Trimmed to 15. Saves ~60% on input tokens per call. Quality degradation for typical questions (latency stats, recent patterns) is minimal. The trade-off is that statistical questions spanning long time windows lose signal — documented as an acceptable edge case at this scope.

**3. Query caching.** An in-memory Map with a 10-minute TTL. If a user asks the same question twice within 10 minutes, the second call returns immediately from cache. No API call, zero cost. Users asking monitoring questions tend to repeat queries ("what's the average latency?" multiple times in a session), so this pays off fast.

**4. Rate limiting.** Hard cap of 20 LLM calls per hour, tracked as a sliding window in a module-level array. Prevents runaway costs from bugs or abuse.

Token counting via `gpt-tokenizer` logs every call's token usage and estimated cost to the `TokenUsage` collection. The dashboard shows the running total — users can see how much they've spent.

---

### Q6. What is the design smell you mentioned in the rate limiter? How would you fix it?

**Answer:**

The `callHistory` array that tracks LLM call timestamps lives at **module scope** — it's a plain array declared at the top of `ai.service.js`, not an instance property of the `AIService` class.

The problem surfaces in testing: you cannot reset `callHistory` between test runs without reaching into the module's internal state (e.g. `module.callHistory.length = 0`). That breaks test isolation. If a test adds 20 entries to simulate a rate-limit hit, those 20 entries persist into the next test unless explicitly cleared. The current tests work around this by testing the *logic pattern* in isolation rather than the actual module state — a compromise.

The fix: inject the call history as a constructor dependency.

```js
// Before (module scope — bad)
const callHistory = [];
class AIService { ... checkRateLimit() { ... callHistory.filter(...) } }

// After (injected — testable)
class AIService {
  constructor(callHistory = []) {
    this.callHistory = callHistory;
  }
  checkRateLimit() {
    // uses this.callHistory
  }
}

// In tests:
const ai = new AIService([]);  // fresh state per test
```

This is a classic dependency injection pattern. It makes the service stateless from the caller's perspective and fully testable without module-level side effects.

---

### Q7. Why are there no frontend tests? Is that a reasonable trade-off?

**Answer:**

Yes, and the reasoning is documented explicitly.

The frontend is primarily **read-and-render**: data arrives via REST on load and via Socket.io in real time. The components take that data and display it. There's very little logic to unit test — no calculations, no state machines, no complex branching.

The backend service layer, by contrast, has anomaly thresholds, rate limiting, caching, and cost arithmetic — all of which can fail silently. A bug in the anomaly threshold doesn't crash anything; it just fires incidents too often or not at all. A bug in the dashboard rendering would be immediately obvious in manual use.

Given a time-constrained assessment, prioritising the backend tests is the right call.

The gaps this creates:
- No verification that the Socket.io listener in `Dashboard.jsx` correctly prepends new responses to state
- No verification that `ChatWidget` submits the query correctly and renders the markdown response
- No regression protection if the component logic changes

React Testing Library tests for `ChatWidget` and the `Incidents` panel would be the next step. `@testing-library/react` + `msw` (Mock Service Worker) to mock the API would cover the meaningful paths.

---

### Q8. How does the caching work, and what are its limitations?

**Answer:**

The cache is an in-process JavaScript `Map` in `ai.service.js`. The key is the exact query string (case-sensitive). The value is `{ response: "...", timestamp: Date.now() }`.

On every `queryData(userQuery)` call:
1. Check if the map contains `userQuery`.
2. If yes, check if `Date.now() - cached.timestamp < 10 * 60 * 1000` (10 minutes).
3. If both are true, return `cached.response` immediately.
4. Otherwise, call the API, store result in map, return result.

**Limitations:**

- **Restart clears it.** The Map lives in process memory. If Railway restarts the backend (deploy, crash, etc.), the cache is empty. Every query is a cache miss until the 10-minute window fills back up. Redis with TTL keys would persist across restarts.

- **Exact string match only.** "What is the average latency?" and "what is the average latency?" are different keys. "What is the average latency?" asked 11 minutes later is also a miss. Semantic caching (embedding similarity) would be more powerful but is significantly more complex.

- **No eviction on memory pressure.** The Map grows unboundedly. In practice, with 20 calls/hour max, it never gets large enough to matter. In production you'd add a max size and LRU eviction.

- **Cache expiry logic is untested.** The test files don't verify that a query asked 11 minutes later correctly bypasses the cache. This is acknowledged as a gap in TESTING_DECISIONS.md.

---

### Q9. Walk me through how the CI pipeline is set up and why.

**Answer:**

GitHub Actions runs on every push to `main` (and PRs targeting `main`). There are two parallel jobs: one for the backend, one for the frontend build.

**Backend job:**
1. Checkout + Node 20 + npm cache
2. `npm install`
3. `npm run lint` (ESLint catches obvious errors before running tests)
4. `npm test` — runs all `*.test.js` files via Node's built-in `--test` runner
5. `npm run coverage` — c8 instruments the test run and generates an lcov report
6. Upload coverage as a workflow artifact

The environment sets `CLAUDE_API_KEY=ci-placeholder`. This is needed because `AIService` references `process.env.CLAUDE_API_KEY` to instantiate the Anthropic client. Without it, the module would throw on import. With the placeholder, the service loads but no real API calls are made (all AI calls are mocked in tests).

**Frontend job:**
1. Checkout + Node 20
2. `npm install`
3. `npm run lint`
4. `npm run build` — Vite produces the production `dist/` bundle

The frontend job exists to catch build failures (broken imports, TypeScript errors if added later) and lint regressions — not test coverage.

---

### Q10. How would you add support for monitoring multiple endpoints?

**Answer:**

The schema already supports it — the `endpoint` field on both `Response` and `Incident` stores the URL. The current code hardcodes `httpbin.org/anything` in `monitor.service.js`.

To extend it:

1. **Configuration**: Add an `endpoints` array to a config file or environment variable: `["https://httpbin.org/anything", "https://example.com/health"]`.

2. **MonitorService**: Loop over the array in the `ping()` function; send a request to each endpoint, save each result with the endpoint URL recorded.

3. **Anomaly detection**: The `checkForAnomalies()` query must be filtered by endpoint: `ResponseModel.find({ endpoint: record.endpoint })`. Currently it pulls the last 20 records globally — mixing endpoints would corrupt the baseline.

4. **Frontend**: Group the response table by endpoint; add endpoint filter dropdowns. The `Incidents` list already displays endpoint per incident.

5. **Rate limit consideration**: More endpoints = more anomaly triggers = more AI calls. The 20 calls/hour cap would need to be re-evaluated or made per-endpoint.

This is described in the engineering notes as "maybe 20 extra lines" — the schema and data flow already support it; the change is mostly in the MonitorService query scope.

---

### Q11. If you had to move this to production, what would be your first three priorities?

**Answer:**

**1. Persistent cache with Redis.**  
The in-memory cache is the most fragile part. Railway deploys restart the process; the cache empties. Redis with a 10-minute TTL on query keys restores the cost savings. It also enables horizontal scaling — multiple backend instances sharing one cache.

**2. Database indexes.**  
`ResponseModel` queries sort by `timestamp` descending and filter by `endpoint`. No indexes exist. At demo scale (hundreds of records) this is fine. At production scale (millions of records) the queries table-scan. Index on `{ endpoint: 1, timestamp: -1 }` covers both the dashboard query and the anomaly detection query.

**3. Mongoose field validation and error handling.**  
The models have no `required` fields, no type validators, no min/max bounds. In production, invalid data silently saves. Adding validators (`required: true`, `min: 0` on responseTime, `match` on endpoint) and returning structured error responses from the API (error codes, not just status 500) would make the system much safer to operate.

After those three, streaming chat responses and a proper test suite for the frontend would follow.

---

### Q12. What would you change about the AIService design if you rewrote it?

**Answer:**

Three things:

**1. Inject dependencies (rate limiter, cache, LLM client).**  
Currently the `callHistory` array and the `Map` cache are module-level state. The Anthropic client is instantiated inside the service. All of these make the service hard to test and impossible to run two instances of with different configurations. Constructor injection solves this cleanly.

**2. Separate concerns.**  
`AIService` currently does four things: rate limiting, caching, token counting, and LLM calling. These are independent concerns. A `RateLimiter` class, a `ResponseCache` class, and a `TokenLogger` class — each separately testable — would make the code easier to reason about and evolve independently.

**3. Validate LLM responses.**  
`generateIncidentReport()` calls Claude and expects JSON back. It strips markdown code blocks and calls `JSON.parse()`, but if Claude returns malformed JSON or a different structure, the error propagates as an unhandled exception. A schema validation step (even just checking that `rootCause` is a string and `recommendations` is an array) before saving would make the incident creation path robust.

---

### Q13. Why was the `gpt-tokenizer` library used for token counting? Isn't that for GPT models, not Claude?

**Answer:**

Good catch. `gpt-tokenizer` implements the BPE (Byte Pair Encoding) tokenization that OpenAI's GPT models use. Claude uses a different tokenizer internally.

The choice was pragmatic: at the time of writing, there was no official Anthropic tokenizer library for Node.js. Anthropic does expose a `client.beta.messages.countTokens()` API method, but that requires an extra API call before every LLM call — adding latency and potentially another billable operation.

`gpt-tokenizer` gives a *close approximation*. For Haiku-scale tokens (600–1000 input tokens per typical call), the difference between GPT tokenization and Claude tokenization is usually less than 5–10%. For cost estimation displayed on a dashboard ("you've spent roughly $0.003 so far"), that level of accuracy is sufficient.

The engineering notes acknowledge the pricing constants themselves are estimates (Haiku 4.5 prices weren't clearly published when written, so they were extrapolated from Haiku 3). The token count approximation compounds this but remains in the right ballpark.

For a production system where cost reporting is used for billing or SLAs, you'd use the official Anthropic token counting API or the Anthropic-provided `countTokens` method.

---

### Q14. The `isResolved` field exists on Incident but is always `false`. Was this intentional?

**Answer:**

Yes, intentional and acknowledged. The field was included in the schema as a forward-looking hook — a production monitoring system would need a way to mark incidents as resolved, either manually by an operator or automatically when subsequent pings return to normal.

The current scope didn't implement the resolution flow because it would require:
- A `PATCH /api/incidents/:id` endpoint
- A button on the Incidents UI to trigger resolution
- Possibly an automatic resolution check (if 3 consecutive pings return to < 1.5× average, auto-resolve)

For the assessment scope, having the field in the schema is better than not having it — it signals awareness that incidents have a lifecycle, not just a creation event. The trade-off is a slightly misleading schema where `isResolved` appears meaningful but is always false.

---

### Q15. How would you implement streaming responses for the chat widget?

**Answer:**

Currently `POST /api/query` waits for the full Claude response before returning. This means the user sees a loading spinner for however long the LLM takes (typically 2–5 seconds for Haiku on a simple query).

Streaming would show words appearing progressively, which feels much faster even if the total time is the same.

**Backend change:**
```js
// In callLLM(), use the streaming API:
const stream = await anthropic.messages.stream({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 1024,
  messages: [{ role: "user", content: prompt }]
});

// Pipe chunks to the HTTP response as Server-Sent Events:
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
for await (const chunk of stream) {
  if (chunk.type === "content_block_delta") {
    res.write(`data: ${chunk.delta.text}\n\n`);
  }
}
res.write("data: [DONE]\n\n");
res.end();
```

**Frontend change (ChatWidget.jsx):**
```js
const response = await fetch(`${API_URL}/api/query`, { method: "POST", body: ... });
const reader = response.body.getReader();
const decoder = new TextDecoder();
let accumulated = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  accumulated += text; // parse SSE lines, extract content
  setCurrentResponse(accumulated); // re-render on each chunk
}
```

The engineering notes describe this as "polish rather than core" for the assessment scope because it's a more involved change (different response format, different frontend consumption model) and the blocking call works fine for a demo. But it would be the first UX improvement in a real deployment.
