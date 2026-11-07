"""Runs the predictor for one business after its owner answered a suggestion.

The web app queues this job from decide(), and saves the returned predictions in place of the business's
old ones. The predictor reads the web app's local database, so the worker has to run on the same machine
as the dev server.
"""

import sys
from pathlib import Path
from typing import Any

PREDICTOR = Path(__file__).resolve().parents[3] / "predictor"


def handle(payload: dict[str, Any]) -> dict[str, Any]:
    entity_id = payload["entityId"]
    if str(PREDICTOR) not in sys.path:
        sys.path.insert(0, str(PREDICTOR))
    from run import predict_business  # the predictor is plain scripts, not an installed package

    return {"entityId": entity_id, "predictions": predict_business(entity_id)}
