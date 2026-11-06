# worker

Polls `apps/web` for queued jobs, runs them on this machine and reports results.

```sh
cp .env.example .env
uv run worker
```

Add a job type by creating `worker/handlers/<type>.py` with a `handle(payload) -> dict` function and registering it in `worker/handlers/__init__.py`. The worker only claims job types it has handlers for. Jobs left running for more than 10 minutes are claimed again, up to 3 attempts.
