# Configuration

The client uses `client/.env.local` for local Vite settings and `client/.env.example` as its public template:

```text
VITE_APP_NAME=FaultLine
VITE_API_BASE_URL=/api
```

The server uses `server/.env.local` for local development, `server/.env.test.example` for tests, `server/.env.docker.example` for Compose, and `server/.env.example` as the general template.

## Environment Variables

- `NODE_ENV`: Application environment (`development`, `test`, `production`).
- `PORT`: HTTP server listening port (default: `5000`).
- `LOG_LEVEL`: Logging verbosity level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`).
- `MONGODB_URI`: MongoDB connection connection string.
- `REDIS_URL`: Redis connection URL for BullMQ queues, schedulers, distributed locks, and pub/sub events.
- `WORKER_CONCURRENCY`: Number of concurrent jobs processed by the worker daemon (default: `5`).
- `CHECK_RETENTION_DAYS`: Number of days to retain `MonitorCheck` history documents before TTL expiration (default: `30`).
- `MONITOR_QUEUE_NAME`: BullMQ queue identifier for monitor checks (default: `monitor-checks`).
- `RECONCILIATION_INTERVAL_SECONDS`: Periodic interval in seconds between scheduler reconciliation passes (default: `300`).
- `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN`: Authentication access token signing secret and TTL.
- `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`: Authentication refresh token signing secret and TTL.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: Transactional email delivery configuration.
- `OTP_HASH_SECRET`, `OTP_CODE_TTL_SECONDS`, `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_MAX_SENDS_PER_HOUR`: Throttling and security settings for verification and password reset codes.
- `PASSWORD_RESET_GRANT_TTL_SECONDS`: Lifetime of password reset grants.

Copy the appropriate example within `server/` before starting the API or worker. Runtime values supplied by Docker, CI, or production are not overwritten. No root `.env` file is used, and credentials must remain outside source control.

When running the API locally with Redis provided by Docker Compose, the Compose Redis service publishes `127.0.0.1:6380` (use `REDIS_URL=redis://127.0.0.1:6380`). When the API runs inside Compose, use `redis://redis:6379` from `server/.env.docker.example` instead. Port 6380 avoids collisions with an existing local Redis service on port 6379.

## Notification Settings

- `NOTIFICATION_ENCRYPTION_KEY`: 64 hexadecimal characters (32 bytes) used for AES-256-GCM encryption of Slack webhook URLs, custom webhook URLs and webhook signing secrets. Optional at startup: without it, email alerts still work but creating or changing Slack and webhook integrations returns `503 NOTIFICATION_NOT_CONFIGURED`.
- `NOTIFICATION_QUEUE_NAME`: BullMQ queue for notification deliveries (default: `faultline-notifications`).
- `NOTIFICATION_WORKER_CONCURRENCY`: Concurrent notification jobs per worker (default: `5`).
- `NOTIFICATION_MAX_ATTEMPTS`: Maximum delivery attempts before a terminal failure (default: `5`).
- `NOTIFICATION_DELIVERY_TIMEOUT_MS`: Per-request timeout for Slack and webhook calls (default: `10000`).
- `NOTIFICATION_RETRY_BASE_MS`, `NOTIFICATION_RETRY_MAX_MS`: Exponential backoff start and ceiling (defaults: `5000`, `300000`).
- `NOTIFICATION_OUTBOX_INTERVAL_MS`: How often the worker reconciles incidents, dispatches pending outbox events and requeues stale deliveries (default: `30000`).
- `APP_ORIGIN`: Also used to build incident links in emails, Slack messages and webhook payloads.

Email notifications reuse `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; no extra provider configuration exists.

Generate a key and keep it only in `server/.env.local` or your secret manager:

```text
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Back the key up with your other secrets. Losing it makes stored integration credentials unreadable (deliveries fail with a configuration error until integrations are re-entered). Rotating it requires re-entering each Slack URL and webhook URL, and rotating each webhook signing secret, because credentials are not re-encrypted automatically. Docker Compose does not set the key in `server/.env.docker.example`; supply it through your deployment environment.

### Slack setup

Create a Slack app at https://api.slack.com/apps, enable Incoming Webhooks, add a webhook to a channel and paste the `https://hooks.slack.com/services/...` URL into Settings, Notifications. See https://api.slack.com/messaging/webhooks. Only `hooks.slack.com` URLs are accepted.

### Testing deliveries locally

1. Start MongoDB and Redis, then run `npm run dev` (API, client and worker).
2. Open `/settings/notifications`, use Send test email, or add a Slack or webhook integration and choose Send test notification. Tests run a single real attempt and show the actual result.
3. For webhooks, expose a public HTTPS receiver (for example through a tunnel). Private, loopback and link-local destinations are always rejected.
4. To produce a real incident, create a monitor that fails (for example a URL returning HTTP 500) with a low failure threshold.

## Analytics

Analytics adds no new environment variables. History is bounded by `CHECK_RETENTION_DAYS` (default 30): ranges that reach further back show the older part as unknown. Set `ANALYTICS_TEST_MONGODB_URI` only when running the MongoDB-backed analytics integration test; it drops the database it connects to, so use a throwaway database.

## Public Status Pages

- `STATUS_PAGE_TOKEN_SECRET`: secret (at least 32 characters) used to sign unsubscribe links. Set a unique random value in production; changing it invalidates unsubscribe links in emails that were already sent.
- `APP_ORIGIN`: the public base URL used for status page, confirmation and unsubscribe links (`<APP_ORIGIN>/status/<slug>`).

Subscriber emails use the existing `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and notification queue settings. Behind nginx, forward `X-Forwarded-For` so rate limits apply per visitor.

## Workspaces

- `WORKSPACE_INVITATION_TTL_DAYS`: how long an invitation link stays valid (default `7`).
- `WORKSPACE_RETENTION_DAYS`: how long a deleted workspace is kept before the worker permanently purges it (default `30`).

Invitation emails use the existing `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `APP_ORIGIN` (links point to `<APP_ORIGIN>/invitations/accept`). Run `npm run migrate:workspaces` (dry-run) and then `-- --execute` when upgrading an existing installation.

Set `ANALYTICS_TEST_MONGODB_URI` to a throwaway database to also run the MongoDB-backed integration tests (analytics, workspaces and the migration); it is dropped by the tests.
