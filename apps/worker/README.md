# worker

Polls `apps/web` for queued jobs, runs them on this machine and reports results.

```sh
cp .env.example .env
uv run worker
```

Add a job type by creating `worker/handlers/<type>.py` with a `handle(payload) -> dict` function and registering it in `worker/handlers/__init__.py`. The worker only claims job types it has handlers for. Jobs left running for more than 10 minutes are claimed again, up to 3 attempts.

## Job types

- `predict-business`: runs `apps/predictor` for one business (`{"entityId": "FI-D0017"}`) and returns its fresh predictions. The web app queues it after every owner answer and saves the result in place of the business's old predictions. The predictor reads the web app's local database, so this job only works with the worker on the same machine as the dev server.
