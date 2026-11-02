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
