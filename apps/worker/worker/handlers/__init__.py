"""Job handlers, one module per job type.

A handler receives the job payload and returns a JSON-serializable dict stored as the job result.
Raise an exception to mark the job as failed. Register new handlers in HANDLERS.
"""

from collections.abc import Callable
from typing import Any

from . import echo

Handler = Callable[[dict[str, Any]], dict[str, Any]]

HANDLERS: dict[str, Handler] = {
    "echo": echo.handle,
}
