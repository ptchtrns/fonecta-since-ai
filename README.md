# Hackathon template

Full-stack TypeScript on Cloudflare plus a Python worker for anything that needs its own machine.

| Layer      | Choice                                                                             |
| ---------- | ---------------------------------------------------------------------------------- |
| Tooling    | pnpm workspaces, [Vite+](https://viteplus.dev) (`vp`: dev, build, lint, fmt, test) |
| UI         | Solid 2 RC with SSR, `@solidjs/router` 2, daisyUI 5 on Tailwind 4                  |
| Server     | `@solidjs/vite-plugin` start mode, API routes from `filesystem-routing`            |
| Data       | Drizzle ORM 1.0 RC on Cloudflare D1 (SQLite), files in R2                          |
| Auth       | Better Auth (email and password)                                                   |
| Validation | zod 4                                                                              |

```
apps/
  web/      Solid app, deployed as a Cloudflare Worker
  worker/   Python job processor, runs anywhere with network access to web
packages/   Shared code, if it ever becomes necessary
```

## Getting started

Requires Node 22.18+, pnpm 11 and, for the worker, [uv](https://docs.astral.sh/uv/).

```sh
pnpm install
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm db:migrate          # apply migrations to the local D1 database
pnpm dev                 # http://localhost:3000
```

Everything runs locally: the dev server executes the app inside workerd with local D1 and R2 emulation (state in `apps/web/.wrangler`).

Run the worker in a second terminal:

```sh
cd apps/worker
cp .env.example .env
uv run worker
```

## How the web app is organised

```
apps/web/src/
  routes/            pages (*.tsx) and API routes (routes/api/**.ts, exporting GET/POST/...)
  schemas/           zod schemas per area, e.g. settings.schema.ts
  services/          business logic, returns ok(data) or err({ reason })
  server/            server-only modules: db, auth, HTTP helpers
  queries/           router query() wrappers that read from the API
  components/        UI
  lib/               isomorphic helpers: Result type, API client, formatting, form state
  db/schema.ts       Drizzle tables
  middleware.ts      session lookup, page guards, API dispatch
```

An API handler parses input, validates it with a schema, calls a service and maps the result to a response. Nothing else:

```ts
// src/routes/api/settings/password.ts
export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  const session = event.locals.session;
  if (!user || !session) return unauthorized();

  const validation = changePasswordSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, changePasswordSchema);

  const [error] = await changePassword(user.id, validation.data, session.id);
  if (error) {
    switch (error.reason) {
      case 'IncorrectPassword':
        return json({ fieldErrors: { oldPassword: 'Incorrect password' } }, 400);
      default:
        return unexpected();
    }
  }

  return json({ message: 'Password changed' });
}
```

Responses follow `ApiResponse` (`{ message?, fieldErrors?, data? }`) from `src/lib/api.ts`. The same schemas run in the browser before a form is sent (`createFormState().validate`), so users get instant feedback and the server stays the source of truth.

Pages are server rendered. Their data comes from the same REST routes: `apiGet()` calls `fetch` in the browser and dispatches the route in-process during SSR, so there are no server functions and no duplicate data paths.

### Adding a feature

1. Table in `src/db/schema.ts`, then `pnpm db:generate` and `pnpm db:migrate`.
2. Schema in `src/schemas/<area>.schema.ts`.
3. Service in `src/services/<area>.service.ts` returning `ok()` / `err()`.
4. Route in `src/routes/api/<area>.ts`.
5. `query()` in `src/queries/` and a page or component that reads it.

If a new server-side package shows up in dev as "file does not exist ... optimize deps", add it to `environments.ssr.optimizeDeps.include` in `apps/web/vite.config.ts`.

## Jobs and the worker

`POST /api/jobs` queues a job (`{ type, payload }`). The worker claims jobs through `POST /api/jobs/claim` and reports through `PATCH /api/jobs/:id`, authenticated with `WORKER_TOKEN`. Add job types as files in `apps/worker/worker/handlers/`. See `apps/worker/README.md`.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck, build, create D1 and R2 on the first run, apply migrations, deploy.

One-time setup:

1. Add repository secrets `CLOUDFLARE_API_TOKEN` (Workers, D1 and R2 edit permissions) and `CLOUDFLARE_ACCOUNT_ID`.
2. After the first deploy, set the app secrets:
   ```sh
   cd apps/web
   pnpm exec wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32
   pnpm exec wrangler secret put WORKER_TOKEN
   ```
3. Point the worker's `API_URL` at the deployed URL.

Manual deploy: `pnpm db:migrate:remote` (from `apps/web`) and `pnpm deploy`.

## Scripts

| Command            | What it does                                 |
| ------------------ | -------------------------------------------- |
| `pnpm dev`         | Dev server for apps/web                      |
| `pnpm build`       | Production build                             |
| `pnpm check`       | Format check, lint and type-aware checks     |
| `pnpm db:generate` | Generate a migration from `src/db/schema.ts` |
| `pnpm db:migrate`  | Apply migrations locally                     |
| `pnpm deploy`      | Build and deploy with wrangler               |

In `apps/web`, `pnpm cf-typegen` regenerates `worker-configuration.d.ts` after changing `wrangler.jsonc`, and `pnpm preview` runs the production build locally.

## Notes

- Solid 2, its router and `@solidjs/vite-plugin` are prereleases. Pin versions and expect API changes when upgrading.
- Images in R2 are served publicly from `/api/files/<key>`. Keys contain a random UUID.
- Passwords are hashed with PBKDF2 through WebCrypto, which stays inside the Workers free plan CPU limit.
