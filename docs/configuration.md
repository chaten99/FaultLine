# Configuration

The client uses `client/.env.local` for local Vite settings and `client/.env.example` as its public template:

```text
VITE_APP_NAME=FaultLine
VITE_API_BASE_URL=/api
```

The server uses `server/.env.local` for local development, `server/.env.test.example` for tests, `server/.env.docker.example` for Compose, and `server/.env.example` as the general template. The server consumes `NODE_ENV`, `PORT`, `LOG_LEVEL`, `MONGODB_URI`, JWT settings, and authentication email settings. Configure `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` sender before enabling email verification or password reset. `OTP_HASH_SECRET` must be a separate random secret of at least 32 characters. `OTP_CODE_TTL_SECONDS`, `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_MAX_SENDS_PER_HOUR`, and `PASSWORD_RESET_GRANT_TTL_SECONDS` control OTP expiry, throttling, attempts, and reset-grant lifetime.

Copy the appropriate example within `server/` before starting the API. Runtime values supplied by Docker, CI or production are not overwritten. No root `.env` file is used, and credentials must remain outside source control.
