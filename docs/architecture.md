# Architecture

FaultLine separates browser concerns in `client/` from the HTTP API and worker process in `server/`. The client uses React, Vite, Axios, Zustand, and TanStack Query. The server uses Express 5 with feature-based modules and runs separate HTTP and worker runtimes.

## System Responsibilities

The monitoring system divides work across four distinct layers:

1. **API Server (`server/src/server.ts`):** Handles authenticated user requests, monitor configuration CRUD, manual check requests (`POST /api/monitors/:id/check-now`), and paginated check telemetry (`GET /api/monitors/:id/checks`). Schedules and unschedules recurring jobs via BullMQ schedulers.
2. **Scheduler Integration (`server/src/queues/monitor-scheduler.service.ts`):** Maintains durable recurring jobs in Redis via BullMQ `upsertJobScheduler` with deterministic scheduler IDs (`monitor:<monitorId>`). Performs startup and periodic reconciliation to keep MongoDB active monitor state and BullMQ schedulers synchronized.
3. **Background Worker (`server/src/worker.ts`, `server/src/workers/monitor-check.worker.ts`):** Independent daemon process that processes scheduled and immediate check jobs. Acquires distributed locks (`lock:monitor:<monitorId>`) with Lua-verified release, performs outbound HTTP probes with strict connection-time SSRF protection, records check history (`MonitorCheck`), atomically updates monitor summary records guarded by `configRevision`, and publishes `monitor.check.completed` domain events via Redis Pub/Sub.
4. **MongoDB Data Store:** Stores monitor definitions and time-series probe executions (`MonitorCheck`) with 30-day automatic TTL expiration.
