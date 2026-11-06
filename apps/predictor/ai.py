"""Sends questions to a local language model through Ollama and returns the answers.

Every answer is saved in ai_cache.json, so the same question is never sent twice. That keeps
re-runs fast and free, and makes the predictions repeatable.
"""

import json
import urllib.request
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen3:1.7b"
CACHE_FILE = Path(__file__).parent / "ai_cache.json"


def load_cache():
    """Return the saved answers, or an empty cache if nothing has been saved yet."""
    if not CACHE_FILE.exists():
        return {}
    return json.loads(CACHE_FILE.read_text(encoding="utf-8"))


cache = load_cache()


def ask(question, instructions=None):
    """Send a question to the model and return its answer as text.

    instructions is an optional system message that tells the model how to behave.
    """
    return cached_answer(question, instructions, answer_format=None)


def ask_for_json(question, instructions=None):
    """Send a question to the model and return its answer parsed from JSON.

    Tell the model which fields to use in the question or the instructions.
    """
    return json.loads(cached_answer(question, instructions, answer_format="json"))


def cached_answer(question, instructions, answer_format):
    """Return the saved answer if this exact question was asked before, otherwise ask the model and save it."""
    key =json.dumps([MODEL, answer_format, instructions, question], ensure_ascii=False)
    if key not in cache:
        cache[key] = send(question, instructions, answer_format)
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

    return cache[key]


def send(question, instructions, answer_format):
    """Send one question to Ollama and return the answer text."""
    messages = []
    if instructions:
        messages.append({"role": "system", "content": instructions})
    messages.append({"role": "user", "content": question})

    request_body = {
        "model": MODEL,
        "messages": messages,
        "stream": False,
        "think": False,
        "options": {"temperature": 0},
    }
    if answer_format:
        request_body["format"] = answer_format

    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(request_body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read())["message"]["content"]


if __name__ == "__main__":
    print(ask("Reply with one short sentence: is this working?"))
