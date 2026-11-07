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
  predictor/ Python, decides what to suggest. Reads the local database, see its README
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

## Connect Suggests dataset

`data/fonecta-connect-suggests-2026/` holds the hackathon bundle, unchanged. Start with its `START_HERE.md`; the fields are described in `docs/DATA_DICTIONARY.md`. Attribution: "Connect Suggests simulator, Since AI ry 2026" (data CC BY 4.0, code MIT, see its `LICENSE.md`). All of it is synthetic.

`src/db/schema.ts` has a table for each data source. To load them, with [uv](https://docs.astral.sh/uv/) installed:

```sh
pnpm db:migrate
pnpm db:seed                       # everything, local
pnpm db:seed:limited               # limited set, local
pnpm --filter web db:seed:remote   # limited set, deployed database
```

Each run empties and refills the dataset tables and leaves app tables alone, except `prediction`, which is emptied along with the businesses. Run the predictor with `--save` again afterwards.

| Load    | Businesses | Rows | Size   | Est. rows written |
| ------- | ---------- | ---- | ------ | ----------------- |
| Full    | 3,032      | 3.5M | 272 MB | over 7M           |
| Limited | 32         | 29k  | 3.4 MB | 61k               |

The limited set is the 17 demo businesses and 15 shopping centres. It keeps their full holiday history and reviews, limits analytics and daily weather to 1 Nov 2025 onwards, and limits weather and peer data to what they use. It has no `dev` or `test` businesses, so `dev_truth_history` stays empty and the 2025 back-test targets aren't loaded. Work across all businesses, such as producing `predictions_2026.csv`, needs the full load: `apps/predictor` reads it from the local database and refuses to run on the limited set.

D1's free plan allows [100,000 written rows a day](https://developers.cloudflare.com/d1/platform/limits/), and indexes count as writes. That is why deployments get the limited set, which fits once a day. A second load on the same day probably won't, because deleting the old rows counts too. Loading everything into a deployed database needs the paid plan and a direct `import_connect_data.py --remote` run.

The only answers loaded are in `dev_truth_history`, which the predictor uses as training data, only for days before the snapshot. The scorer's labels and the owner simulator's data stay in the dataset's files, where `evaluate.py` and `mock_api` read them.

## Predictions on the dashboard

`python3 apps/predictor/run.py --save local` replaces the `prediction` table through Wrangler, and the front page shows the rows for the signed-in account's business. For the deployed site, use `--save remote` after a full local load: the predictor always computes locally and sends only the demo businesses' rows, because the deployed database doesn't have the others.

## The owner's side

An account belongs to one business, chosen with the combobox when signing up (`user.entity_id`). The dashboard's pages:

| Page | What it shows |
| ---- | ------------- |
| Front page | The business's name, the assistant's question box, the four headline numbers, the next suggestion (all of them on request), connections, profile, listings, reviews and suggested edits |
| Company information | The business card and its edit form, including the pages with the business's hours, the profile checklist and holidays without hours |
| Visibility | Tabs for Listings (sites, update speeds, accounts to link), SEO (local search score) and AI (what assistants can answer) |
| Reports | Profile strength, what happened to the suggestions, what Connecta AI found, how the owner answers, reviews |
| Integrations, Account | Under Maintenance: WhatsApp, and sign-in details and the account's business |

The sidebar counts what needs the owner on each page: waiting suggestions, missing profile items, and sites not live plus missing SEO and AI items.

The scores are in `src/lib/visibility.ts`, worked out from data the app already has: the business's details, its listings, reviews and suggested edits (`src/services/presence.service.ts`). For the dataset's businesses these come from the dataset's tables; for the Yext account's, from Yext's Listings, Reviews and Publisher Suggestions APIs. The assistant's box answers its four offered questions from the same data; it has no language model behind it yet.

Dataset tables stay as they were loaded, so clicks in the demo can't change what the predictor scores. What owners do is kept in app tables that survive a reseed or a predictor run:

| Table | What it holds |
| ------------------ | -------------------------------------------------------------------------- |
| `business_profile` | The owner's edits on top of `entity`, WhatsApp settings, standing permission |
| `suggestion_state` | One row per suggestion sent or answered: token for the link, decision, what was suggested |
| `business_source` | Pages the owner linked, any number of them, and the hours found on them |

Optional settings, all in `.dev.vars.example`:

- `YEXT_API_URL`, `YEXT_API_KEY`: the team's Yext sandbox. Its locations show up in the business search, marked "Yext". Taking one on copies it into `entity` with `split = 'yext'`, and its dashboard reads it from Yext again on each load. Changes to it go to the sandbox. A reseed removes the copy, and the app adds it again from Yext the next time someone opens it. The predictor answers the season's special days for these businesses when saving with `--save`, but leaves them out of `predictions_2026.csv` and the score.
- `YEXT_MOCK_URL`: the dataset's mock (`python3 data/fonecta-connect-suggests-2026/mock_api/server.py`), for the dataset's businesses, which the sandbox doesn't have. It only accepts `hours`, `name` and `closed`, so saving other business details against it shows its error.
- Without the Yext API a business needs, decisions are saved and the UI says they aren't live. Before each write the app reads the hours Yext has now and changes only what was approved, because Yext replaces the whole hours object.
- `WHATSAPP_*`: the Cloud API. Button taps arrive at `/api/whatsapp/webhook`. Without these, Integrations still shows the next message and a link to its answer page.
- `APP_URL`: the public address in owner links, and required for the nightly cron, which reads linked pages again, applies standing permissions and sends each owner their next question.

Linked pages are read with a plain pattern match (`src/lib/source-reader.ts`), so only a date or holiday name followed by hours or "closed" counts. Sites that block automatic reading, such as Facebook and Instagram often do, show as "Could not read".

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

| Command                | What it does                                 |
| ---------------------- | -------------------------------------------- |
| `pnpm dev`             | Dev server for apps/web                      |
| `pnpm build`           | Production build                             |
| `pnpm check`           | Format check, lint and type-aware checks     |
| `pnpm --filter web test --run` | Unit tests for the pure helpers in `src/lib` |
| `pnpm db:generate`     | Generate a migration from `src/db/schema.ts` |
| `pnpm db:migrate`      | Apply migrations locally                     |
| `pnpm db:seed`         | Load the whole Connect dataset into local D1 |
| `pnpm db:seed:limited` | Load the limited Connect set into local D1   |
| `pnpm deploy`          | Build and deploy with wrangler               |

In `apps/web`, `pnpm cf-typegen` regenerates `worker-configuration.d.ts` after changing `wrangler.jsonc`, and `pnpm preview` runs the production build locally.

## Notes

- Solid 2, its router and `@solidjs/vite-plugin` are prereleases. Pin versions and expect API changes when upgrading.
- Images in R2 are served publicly from `/api/files/<key>`. Keys contain a random UUID.
- Passwords are hashed with PBKDF2 through WebCrypto, which stays inside the Workers free plan CPU limit.
