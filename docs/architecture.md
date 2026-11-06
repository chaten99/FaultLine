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
