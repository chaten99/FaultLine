# Architecture

FaultLine separates browser concerns in `client/` from the HTTP API and worker process in `server/`. The client uses React, Vite, Axios, Zustand, and TanStack Query. The server uses Express 5 with feature-based modules and runs separate HTTP and worker runtimes.

## System Responsibilities

The monitoring system divides work across four distinct layers:

1. **API Server (`server/src/server.ts`):** Handles authenticated user requests, monitor configuration CRUD, manual check requests (`POST /api/monitors/:id/check-now`), and paginated check telemetry (`GET /api/monitors/:id/checks`). Schedules and unschedules recurring jobs via BullMQ schedulers.
2. **Scheduler Integration (`server/src/queues/monitor-scheduler.service.ts`):** Maintains durable recurring jobs in Redis via BullMQ `upsertJobScheduler` with deterministic scheduler IDs (`monitor:<monitorId>`). Performs startup and periodic reconciliation to keep MongoDB active monitor state and BullMQ schedulers synchronized.
3. **Background Worker (`server/src/worker.ts`, `server/src/workers/monitor-check.worker.ts`):** Independent daemon process that processes scheduled and immediate check jobs. Acquires distributed locks (`lock:monitor:<monitorId>`) with Lua-verified release, performs outbound HTTP probes with strict connection-time SSRF protection, records check history (`MonitorCheck`), atomically updates monitor summary records guarded by `configRevision`, and publishes `monitor.check.completed` domain events via Redis Pub/Sub.
4. **MongoDB Data Store:** Stores monitor definitions and time-series probe executions (`MonitorCheck`) with 30-day automatic TTL expiration.

## Notifications

Notifications are driven by persisted incident lifecycle transitions, never by individual failed checks.

```text
Incident lifecycle service -> NotificationOutbox (unique eventId)
  -> dispatcher (claims entry, resolves preferences, creates deliveries by unique deliveryKey)
  -> BullMQ notification queue -> notification worker -> email | Slack | webhook
  -> NotificationDelivery (status, attempts, safe diagnostics)
```

Event types: `incident.opened`, `incident.acknowledged` (opt-in) and `incident.resolved` (automatic recovery or manual resolution). Event ids are `<type>:<incidentId>`, so each transition has exactly one outbox entry.

- **Outbox and recovery:** The lifecycle service writes the outbox entry right after the incident change and attempts an immediate dispatch. Because MongoDB transactions are not assumed, the worker also runs a maintenance pass every `NOTIFICATION_OUTBOX_INTERVAL_MS`: it recreates outbox entries for recently changed incidents that lack them, dispatches pending or expired-lock entries (claimed atomically, with backoff on failure), and requeues deliveries whose job was lost. A Redis outage or crash after an incident is saved therefore delays, but does not lose, a notification.
- **Idempotency:** `deliveryKey = eventId|channel|integrationId` is unique. BullMQ job ids are `<deliveryId>_<generation>`; a manual retry or recovery bumps the generation so stale jobs are ignored. Delivery is at least once: a crash between a provider accepting a request and the status write can cause one duplicate. Webhook receivers can deduplicate on the `id` field or the `X-FaultLine-Delivery` header.
- **Preferences:** Per-account master switch, per-event toggles (defaults: opened on, acknowledged off, resolved on), per-channel switches, and per-integration event subscriptions. Email is sent only to the account's verified address. Slack and webhook integrations send only when explicitly enabled.
- **Retries:** Network errors, timeouts, HTTP 408, 429 (honouring `Retry-After`) and 5xx are transient: exponential backoff from `NOTIFICATION_RETRY_BASE_MS` up to `NOTIFICATION_RETRY_MAX_MS`, at most `NOTIFICATION_MAX_ATTEMPTS`. Invalid credentials (401/403/404/410), invalid payloads (400/413/422), redirects and blocked destinations fail permanently. Failed incident deliveries can be retried manually from the history. Test deliveries make a single attempt.
- **Outbound safety:** Slack requires `hooks.slack.com` with the documented path shape. Webhooks require HTTPS on port 443 or 8443. Destinations are re-resolved at connection time and every resolved address is validated (private, loopback, link-local, multicast, metadata, documentation and mapped ranges are rejected), so DNS rebinding cannot bypass the check. Redirects are never followed; responses are capped and requests time out.
- **Secrets:** Slack and webhook URLs and signing secrets are AES-256-GCM encrypted with a per-record nonce, bound to the user and integration. API responses return only a masked hint. A signing secret is shown once at creation or rotation.

### Webhook format

```json
{
  "id": "incident.opened:<incidentId>",
  "type": "incident.opened",
  "version": 1,
  "createdAt": "2026-11-06T10:00:00.000Z",
  "data": {
    "incidentId": "...",
    "monitorId": "...",
    "monitorName": "...",
    "title": "...",
    "status": "open",
    "openedAt": "...",
    "firstFailureAt": "...",
    "acknowledgedAt": null,
    "resolvedAt": null,
    "resolutionType": null,
    "durationMs": null,
    "failureCategory": "UNEXPECTED_STATUS",
    "statusCode": 503,
    "failureThreshold": 3,
    "incidentUrl": "..."
  }
}
```

Headers: `X-FaultLine-Event`, `X-FaultLine-Delivery`, `X-FaultLine-Timestamp` (Unix seconds) and `X-FaultLine-Signature`. The signature is `v1=` followed by the hex HMAC-SHA256, keyed with the signing secret, of the string `<timestamp>.<raw request body>`. Verify with the raw bytes before parsing, compare in constant time, and reject timestamps older than a few minutes.

```js
const expected =
  "v1=" + crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
```

Respond with any 2xx status to acknowledge. Other responses are handled by the retry rules above.

## Analytics and Uptime Reporting

Analytics are derived from the existing `MonitorCheck`, `Incident` and a small `MonitorLifecycleEvent` history. No monitor, check or incident data is duplicated.

All endpoints live under `/api/analytics` (`overview`, `response-times`, `availability`, `monitors`, `incidents`, `monitors/:monitorId`, `export`), require authentication, and only ever query the caller's own monitors. Ranges are UTC ISO timestamps (`from`, `to`) or a preset (`range=24h|7d|30d|90d`); the end cannot be in the future, the start must precede it, and the span must be between 5 minutes and 90 days. The browser displays times in its own timezone.

### Metric definitions

- **Eligible check:** a check with a `completedAt` whose status is `success`, or `failure`/`timeout` with a failure category that also opens incidents (`UNEXPECTED_STATUS`, `TIMEOUT`, `NETWORK_ERROR`, `DNS_FAILURE`). Queued and running checks, `error` checks (worker errors, paused-monitor skips) and non-qualifying failures such as `SSRF_PROHIBITED` or `RESPONSE_TOO_LARGE` are excluded because they were not a valid monitoring attempt.
- **Check success rate:** successful eligible checks / eligible checks, with the sample size reported. It is independent of availability.
- **Eligible monitored time:** time a monitor existed, was active according to recorded lifecycle events, and was not in an unknown period.
- **Active, paused and untracked time:** `created`, `paused` and `resumed` events are recorded when monitors change. Monitors that predate this feature receive a single `tracking_started` baseline at first startup; time before it is reported as unknown and is never assumed to be active or paused. Paused time is excluded and never counts as downtime.
- **Unknown (gap) time:** within active time, any stretch with no eligible check for longer than the interval plus a grace window (the larger of 30 seconds and half the interval) is unknown. It is excluded from availability rather than assumed healthy. History older than `CHECK_RETENTION_DAYS` is therefore unknown.
- **Downtime:** the union of incident outage intervals (`firstFailureAt` to `resolvedAt`, open incidents run to the end of the window or now), clipped to the window and intersected with verified monitored time. Overlapping or duplicated incidents are counted once. Failures below the incident threshold are not downtime.
- **Availability:** (verified monitored time - downtime) / verified monitored time. It is `null` with state `insufficient` when verified monitoring is shorter than one check interval; it is never reported as 0% or 100% without data. Across monitors, time is pooled (weighted by verified time), not averaged.
- **Coverage:** completed eligible checks inside active time / expected checks (`floor(active duration / interval)`), capped at 100%. It measures whether monitoring is happening and is separate from availability.
- **Downtime state:** `observed` (no unknown time), `incomplete` (some unknown time) or `unknown` (nothing verified).
- **Response time:** only checks that received an HTTP response and recorded a duration (`success`, or `failure` with a status code). Timeouts, network errors and DNS failures have no meaningful response time and are excluded. Failed HTTP responses (for example a 503) are included.
- **Percentiles:** computed on the underlying observations with the nearest-rank method (the value at rank `ceil(p/100 * N)`), never from averages or other percentiles. MongoDB groups durations into an exact integer-millisecond histogram (values of one second or more are floored to 10 ms) and histograms from buckets or monitors are merged before ranking, so percentiles below one second are exact and above one second are within 10 ms. Average, minimum and maximum are exact.
- **Incident metrics:** incidents are counted by their first failure time and current status. Average resolution time uses only resolved incidents; open incidents show elapsed time and are marked ongoing.

The uptime timeline has one cell per time bucket (5 minutes to 1 day depending on range) with state `up`, `down`, `paused`, `unknown` or `insufficient`, plus the incident that caused a `down` cell.

### Aggregation strategy

Analytics are computed on demand with indexed MongoDB aggregations over the existing check and incident collections: grouped counts, exact latency histograms and a `$setWindowFields` pipeline that finds missing-check gaps. Raw checks are never loaded into Node. With a 90 day range cap and bounded retention this stays cheap, so no pre-aggregated rollup collection was added; it can be introduced later behind the same service functions if volumes grow. Computation never runs in the monitor check processor. The client does not poll; it refreshes on demand and, at most every 30 seconds, when incident events arrive.

### CSV export

`GET /api/analytics/export?type=overview|monitors|incidents` returns `text/csv` for the selected range and optional monitor. Fields are escaped, control characters are stripped, and text starting with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'` to prevent spreadsheet formula injection. Endpoints are exported without credentials, query strings or fragments. Incident exports are limited to 10,000 rows (HTTP 413 otherwise). Exports are rate limited and timestamped with the generation time.

### Verifying locally

1. Run `npm test --workspace server`; calculation tests use fixed timestamps.
2. Start MongoDB (for example `docker run --rm -p 27018:27017 mongo:8`) and run `ANALYTICS_TEST_MONGODB_URI=mongodb://127.0.0.1:27018/faultline_test npm test --workspace server -- analytics.integration` to check the real aggregations against independently computed values.
3. Create a monitor, let it run, pause and resume it, then compare `/analytics` with the Monitor Details history.

## Public Status Pages

Owners publish branded status pages at `/status/:slug`, built from services (groups of their own monitors). Public data is always derived from the existing monitor, check and incident records; nothing is stored separately or invented.

### Models and API

- `PublicStatusPage` (owner, name, globally unique `slug`, description, branding, `draft | published | unpublished`, subscriber settings), `StatusPageService` (page, ordered, enabled, `monitorIds`), `StatusPageSubscriber` and `StatusPageDelivery` (subscriber email deliveries).
- Authenticated management API under `/api/status-pages`: pages (CRUD, publish, unpublish, `slug-available`), services (CRUD and `reorder`), `monitor-options`, `preview`, `subscribers` (masked addresses and counts) and `analytics`. Every operation checks page ownership, and every monitor id in a service is verified to belong to the owner server-side. Publishing requires at least one enabled service with a monitor.
- Unauthenticated public API under `/api/public/status-pages/:slug`: `GET /` (status and active incidents), `/incidents` (paginated), `/history?range=24h|7d|30d|90d`, and the subscription endpoints. Responses are built by explicit serializers: no owner or monitor ids, monitor names, URLs, failure details, internal incident notes or subscriber data. Draft, unpublished, deleted and unknown slugs all return the same 404.
- Public GET responses use `Cache-Control: no-cache` with ETags, so browsers revalidate on every request: unpublishing or deleting takes effect immediately. A 10 second server-side snapshot cache and a 60 second history cache are cleared on every page, service, publish and unpublish change, and publication state is always read from the database. Subscription, preview and management responses are never cached.

### Public status rules

A monitor is `paused` if inactive; `down` if it has an open or acknowledged incident; `operational` if its most recent eligible check succeeded within `2 x interval + grace` (grace is the larger of 30 seconds and half the interval); otherwise `unknown`. A failed latest check without an incident is not reported as operational or as an outage. A service ignores paused monitors: it is `major_outage` if all remaining monitors are down, `partial_outage` if some are, `operational` only if all are operational, and `unknown` otherwise (including when nothing is active). The page status is the worst enabled service (`major_outage`, then `partial_outage`, then `unknown` unless every service is operational). Disabled services are not shown. Public incidents use generic titles built from service names and only persisted timestamps.

Uptime history reuses the analytics availability calculation (same definitions for downtime, unknown and paused time) scoped to the service's monitors; insufficient data is reported as such.

### Subscribers

Visitors enter an email and choose events (opened and resolved by default; acknowledged only when the owner offers it). A single-use, 32-byte random confirmation token is emailed and only its SHA-256 digest is stored; it expires after 24 hours and a new request invalidates the previous one. Requests are limited per IP and per address (3 per hour), re-sends have a 60 second cooldown, and responses are identical whether or not an address is already known. Nobody is subscribed until they confirm. Unsubscribe links use an HMAC (`STATUS_PAGE_TOKEN_SECRET`) over the page and subscriber, so every notification can carry one without storing raw tokens; the page asks for explicit confirmation (GET only validates), and unsubscribing works even after a page is unpublished.

Notifications reuse the existing incident outbox: when an incident event is dispatched, active, matching subscribers of published pages that include the monitor get a `StatusPageDelivery` (unique per event and subscriber), processed on the shared BullMQ notification queue with the same retry and backoff rules. Consent, preferences and page state are re-checked at send time, so unsubscribing stops delivery even for queued jobs. Subscriber emails use the existing Resend client, EJS layout and plain-text alternatives, include `List-Unsubscribe`, and never contain internal monitor names or error details. Owner email, Slack and webhook alerts are unaffected.

### Realtime

Visitors connect to the `/public` Socket.IO namespace without authentication and emit `subscribe` with `{ slug }`; the server joins them to a room only if the page is published. Events `public.status.updated`, `public.incident.created`, `public.incident.updated`, `public.incident.resolved` and `public.page.unpublished` are published after incident changes are persisted, to that page's room only; the user-scoped rooms never receive them. On unpublish or delete, sockets are removed from the room. Clients load an HTTP snapshot first and resynchronize once after reconnecting.

`app.set("trust proxy", ...)` trusts private-range proxies so per-IP limits see the visitor address behind nginx.
## Profile and Sessions

Authenticated users manage their account at `/profile`.

- `GET /api/profile` returns the account (name, email, verification state, member-since date) and live counts of monitors, active monitors, open incidents and status pages. `PATCH /api/profile` updates the display name only (2 to 80 characters, no markup). Email changes are not supported.
- `POST /api/auth/password` changes the password after verifying the current one with argon2, rejects reuse of the current password, is limited to 5 attempts per 15 minutes, and signs out every other device while keeping the current session.
- `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` and `POST /api/auth/sessions/revoke-others` list and revoke refresh-token sessions. These live under `/api/auth` because the refresh cookie is scoped to that path, which is how the server tells which listed session is the current one. Each session records its last use and a browser and operating system label derived from the user agent; raw user agents, IP addresses and token hashes are never returned. Revoking the current session clears the cookie.
