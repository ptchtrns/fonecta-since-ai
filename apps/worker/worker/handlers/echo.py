from typing import Any


def handle(payload: dict[str, Any]) -> dict[str, Any]:
    """Example handler: returns the payload unchanged."""
    return {"echo": payload}
