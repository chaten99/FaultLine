# FaultLine

FaultLine is a foundation for real-time API monitoring and incident response.

## Stack

React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Express 5, Mongoose, MongoDB, Pino, Vitest and Docker Compose.

## Requirements

Node.js 24 Active LTS and npm 11 or newer.

## Local development

```powershell
npm install
npm run dev
```

The client runs on Vite's development port and the API runs on port 4000. Copy the application environment examples when local values need to be changed. Do not create a root `.env` file.

## Docker

```powershell
docker compose --env-file server/.env.docker.example up --build
```

## Validation

```powershell
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

See [configuration](docs/configuration.md), [architecture](docs/architecture.md) and [deployment](docs/deployment.md).
