"""Asks a local language model, through Ollama, for answers in JSON.

Every answer is saved in ai_cache.json and reused, so re-runs are fast and give the same predictions.
"""

import json
import urllib.request
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen3:1.7b"
CACHE_FILE = Path(__file__).parent / "ai_cache.json"


def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


cache = load_cache()


def ask(question, instructions):
    """Ask the model a question and return its answer as a dict."""
    key = json.dumps([MODEL, "json", instructions, question], ensure_ascii=False)
    if key not in cache:
        cache[key] = send(question, instructions)
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

    return json.loads(cache[key])


def send(question, instructions):
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": question},
        ],
        "format": "json",
        "stream": False,
        "think": False,  # qwen3 otherwise writes out its reasoning first, which is much slower
        "options": {"temperature": 0},
    }
    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read())["message"]["content"]


if __name__ == "__main__":
    print(ask('Is this working? Answer {"working": true} or {"working": false}.', "Answer only with JSON."))
