# Configuration

The client uses `client/.env.local` for local Vite settings and `client/.env.example` as its public template:

```text
VITE_APP_NAME=FaultLine
VITE_API_BASE_URL=/api
```

The server uses `server/.env.local` for local development, `server/.env.test.example` for tests, `server/.env.docker.example` for Compose, and `server/.env.example` as the general template. The server currently consumes `NODE_ENV`, `PORT`, `LOG_LEVEL` and `MONGODB_URI`.

Copy the appropriate example within `server/` before starting the API. Runtime values supplied by Docker, CI or production are not overwritten. No root `.env` file is used, and credentials must remain outside source control.
