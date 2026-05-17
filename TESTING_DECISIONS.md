# Testing Decisions

## What I'm calling "core"

This is a backend service that either detects HTTP anomalies reliably and gates LLM calls effectively, or it doesn't. Everything else — dashboard rendering, Socket.io push, schema structure — is either simple enough that bugs would surface immediately, or it's covered indirectly.

The non-trivial logic sits in three places: the anomaly threshold in `monitor.service.js`, the rate limiting and cost tracking in `ai.service.js`, and error propagation in `routes/api.js`.

The monitor service is the one I focused on most heavily, because it's the closest thing to business logic in this system. Get the threshold wrong and you're either spamming the LLM with false positives or missing real incidents — both failure modes are silent. Nothing crashes. It just does the wrong thing quietly.

## Walking through the test cases

**`monitor.service.test.js`** covers three scenarios:

The "fewer than 5 records" test exists because when the system first starts, the first few pings have no meaningful baseline. Without the guard, you'd trigger a false incident on the very first request. This test confirms the guard actually holds — it's easy to write the condition backwards.

The "normal response time" test is a boundary check. 350ms against a 200ms average sits below the 2x threshold (400ms) and nothing should fire. Partly this documents intent: the threshold is 2x exactly, not "roughly 2x" or "close enough".

The "exceeds 2x" test is the main path. 600ms against 200ms average should trigger `generateIncidentReport`. The assertion checks that it's called with the specific record object, not just that it was called at all — that distinction matters if the function gets called multiple times and you want to confirm it received the right arguments.

**`ai.service.test.js`** covers pricing arithmetic and rate limit logic.

The pricing test is a bit pedantic but it's there because the pricing constants are hand-typed floats and arithmetic errors compound. If someone updates the constants and forgets to update the calculation, the test catches it.

The rate limit test mocks the underlying logic rather than the actual module state, because the module-level `callHistory` is hard to reset between test runs. It tests the filtering logic in isolation rather than the full integration — a compromise, but an honest one. The comment in the test file says this; felt worth flagging rather than hiding.

**`api.test.js`** goes through the full request/response cycle for all four endpoints.

These use supertest so they hit the actual Express routing and middleware. DB calls and AI service calls are mocked, so no MongoDB needed to run them. The `POST /api/query` cases cover three paths: missing body (400), successful response, and the error path when the service throws — which in production is usually the rate limit being hit. Worth testing all three because the 400 and 500 cases have different shapes.

## What's not covered

`callLLM` in `ai.service.js` isn't tested directly — it makes a live Anthropic API call and there's no mock at that level. Testing it properly would require either mocking the SDK or having a test API key. Skipped it here; the integration path gets exercised in production, and mocking the SDK would've been testing my mock rather than the code.

The cache hit/miss behaviour in `queryData` isn't explicitly tested. The integration tests mock at a higher level, so the actual expiry logic (does it skip the API call on a repeat query within 10 minutes?) isn't verified. That's a gap worth noting.

Frontend has no tests. The dashboard is mostly read-only rendering of data that arrives via WebSocket and REST — there's not much logic to unit test. React Testing Library for the incident panel and chat widget would be the obvious next step, but prioritising the backend service layer felt right given the time constraints. That's where the behaviour that's hard to observe manually lives.