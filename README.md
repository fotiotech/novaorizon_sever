# Server (Express API)

## Local development

```powershell
pnpm dev            # tsx watch dev.ts  → http://localhost:3000/api
```

## Local *production* build (same thing Vercel runs)

The production build compiles to `dist/` and the compiled entry listens on
`PORT`:

```powershell
pnpm build           # tsc -p tsconfig.build.json  → dist/
pnpm start           # node dist/server.js          (NODE_ENV=production)

# one-shot: compile + boot + hit GET /api/health, then exit 0/1
pnpm test:build
```

`tsconfig.build.json` mirrors the production type environment (it includes the
`DOM` lib, which is what Vercel's TypeScript check uses). That parity is what
caught the `Response` shadowing bug: importing Express's `Response` into a
module that also calls `fetch()` made `fetch`'s return type resolve to the
Express response in the production build, so `.ok`/.json()` failed to type
check there while passing locally.

> If `pnpm` is unavailable, use the compiler directly:
> `node node_modules/typescript/bin/tsc -p tsconfig.build.json`
> then `node dist/server.js`.

## Environment variables

`config/env.ts` throws at boot when a required variable is missing
(`MONGODB_URI`, `JWT_SECRET`, `COOKIE_SECRET`, …). Locally they come from
`.env` / `.env.local`; on Vercel set them in **Project → Settings →
Environment Variables** for Production *and* Preview.

## Deploying to Vercel

`vercel.json` builds the serverless entrypoint `api/index.ts` (which exports
the Express app) and rewrites every request to it:

```json
{
  "builds": [{ "src": "api/index.ts", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "api/index.ts" }]
}
```

The deployment root must be this `server/` directory (package.json +
vercel.json + api/ live here). The project is already linked via `.vercel/`.

## Endpoints

`GET /api/health` is the liveness probe used by `test:build` and by hosts.
