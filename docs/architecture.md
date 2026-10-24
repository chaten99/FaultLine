# Architecture

FaultLine separates browser concerns in `client/` from the HTTP API in `server/`. The client uses React, Vite, Axios, Zustand and TanStack Query. The server uses Express 5 with feature-based modules.

Each server feature owns its routes, controllers and services. Controllers remain thin and delegate application work to named arrow-function services. The health module is the only implemented feature.

Environment files belong to their application workspace. Redis and BullMQ are reserved for future queues and workers; Docker Compose provisions Redis without starting application workers.
