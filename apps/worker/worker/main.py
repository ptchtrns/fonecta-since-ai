"""Poll the web app for jobs, claim one, dispatch it to its handler, report the result."""

import logging
import os
import signal
import time
import traceback
from typing import Any

import httpx
from dotenv import load_dotenv

from .handlers import HANDLERS

log = logging.getLogger("worker")
running = True


def stop(*_: Any) -> None:
    global running
    running = False
    log.info("Stopping after the current job")


def claim(client: httpx.Client) -> dict[str, Any] | None:
    response = client.post("/api/jobs/claim", json={"types": list(HANDLERS)})
    if response.status_code == 204:
        return None
    response.raise_for_status()
    return response.json()["data"]


def report(client: httpx.Client, job_id: str, body: dict[str, Any]) -> None:
    client.patch(f"/api/jobs/{job_id}", json=body).raise_for_status()


def process(client: httpx.Client, job: dict[str, Any]) -> None:
    log.info("Job ID %s claimed, type %s", job["id"], job["type"])
    try:
        result = HANDLERS[job["type"]](job["payload"])
        report(client, job["id"], {"status": "done", "result": result})
        log.info("Job ID %s done", job["id"])
    except Exception as error:  # noqa: BLE001 - any handler failure fails the job
        log.exception("Job ID %s failed", job["id"])
        message = f"{error}\n{traceback.format_exc()}"[:4000]
        report(client, job["id"], {"status": "failed", "error": message})


def main() -> None:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    api_url = os.environ.get("API_URL", "http://localhost:3000")
    token = os.environ["WORKER_TOKEN"]
    interval = float(os.environ.get("POLL_INTERVAL", "2"))

    log.info("Polling %s for job types: %s", api_url, ", ".join(HANDLERS))
    with httpx.Client(
        base_url=api_url, headers={"authorization": f"Bearer {token}"}, timeout=30
    ) as client:
        while running:
            try:
                job = claim(client)
            except httpx.HTTPError as error:
                log.warning("Claim failed: %s", error)
                job = None
            if job is None:
                time.sleep(interval)
                continue
            process(client, job)


if __name__ == "__main__":
    main()
