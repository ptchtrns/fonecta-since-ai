"""Asks a language model for answers in JSON: Featherless in the cloud, or Ollama on this machine.

Every answer is saved in ai_cache.json and reused, so each question is paid for only once and
re-runs give the same predictions. Commit the cache so teammates don't pay for the same answers.
"""

import json
import os
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

PROVIDER = "featherless"  # or "ollama"
MODEL = "mistralai/Mistral-Small-24B-Instruct-2501"  # used when no model is given; with Ollama: "qwen3:1.7b"

# Bigger models use more of our plan's parallel limit, so fewer of their requests can run at once.
AT_ONCE = {
    "Qwen/Qwen2.5-72B-Instruct": 1,
    "mistralai/Mistral-Small-24B-Instruct-2501": 2,
}

# Stops a run before it can drain the team's credits, e.g. if a bug keeps asking new questions.
MAX_TOKENS_PER_RUN = 2_000_000

FEATHERLESS_URL = "https://api.featherless.ai/v1/chat/completions"
OLLAMA_URL = "http://localhost:11434/api/chat"
CACHE_FILE = Path(__file__).parent / "ai_cache.json"
ENV_FILE = Path(__file__).parents[2] / ".env"

tokens_used = 0
tokens_lock = threading.Lock()


def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def save_cache():
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")


cache = load_cache()


def ask(question, instructions, model=MODEL):
    """Ask the model a question and return its answer as a dict ({} if it didn't answer in JSON)."""
    key = cache_key(question, instructions, model)
    if key not in cache:
        cache[key] = send(question, instructions, model)
        save_cache()

    return read_json_answer(cache[key])


def ask_many(questions, instructions, model=MODEL):
    """Ask several questions, a few at a time, and cache the answers. Read them afterwards with ask().

    Only this function writes the cache, so the parallel requests can't overwrite each other's answers.
    """
    new_questions = [question for question in questions if not is_cached(question, instructions, model)]
    with ThreadPoolExecutor(max_workers=AT_ONCE.get(model, 1)) as pool:
        answers = pool.map(lambda question: send(question, instructions, model), new_questions)
        for question, answer in zip(new_questions, answers):
            cache[cache_key(question, instructions, model)] = answer
            save_cache()


def is_cached(question, instructions, model=MODEL):
    return cache_key(question, instructions, model) in cache


def cache_key(question, instructions, model=MODEL):
    return json.dumps([model, "json", instructions, question], ensure_ascii=False)


def read_json_answer(text):
    """Cloud models sometimes wrap the JSON in ```json fences or a sentence, so take what's between the braces."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return {}


def send(question, instructions, model):
    if PROVIDER == "featherless":
        return send_to_featherless(question, instructions, model)
    return send_to_ollama(question, instructions, model)


def send_to_featherless(question, instructions, model):
    global tokens_used
    if tokens_used > MAX_TOKENS_PER_RUN:
        raise RuntimeError(f"Stopped: this run has used {tokens_used} tokens, over MAX_TOKENS_PER_RUN in ai.py")

    answer = post_with_retries(question, instructions, model)
    text = answer["choices"][0]["message"]["content"]

    # Some models don't report usage; about 4 characters per token is close enough for the limit.
    tokens = answer.get("usage", {}).get("total_tokens") or len(instructions + question + text) // 4
    with tokens_lock:
        tokens_used += tokens
    return text


def post_with_retries(question, instructions, model, attempts=6):
    """Send the request, waiting and trying again while Featherless is busy.

    Busy means "too many requests" (429) when our plan's parallel limit is hit, a server error, or a
    reply saying the model is "at capacity", which less-used models are until Featherless loads them.
    """
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": question},
        ],
        "temperature": 0,
        "max_tokens": 200,  # our answers are one short line of JSON, with the review in English
    }
    request = urllib.request.Request(
        FEATHERLESS_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {featherless_key()}"},
    )
    for attempt in range(attempts):
        last_try = attempt == attempts - 1
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                reply = json.loads(response.read())
        except urllib.error.HTTPError as error:
            server_busy = error.code == 429 or error.code >= 500
            if not server_busy or last_try:
                raise
        else:
            if "error" not in reply:
                return reply
            if last_try:
                raise RuntimeError(f"Featherless: {reply['error'].get('message')}")
        time.sleep(2 ** attempt)


def featherless_key():
    """From the environment, or from the .env file in the repo root (gitignored)."""
    if os.environ.get("FEATHERLESS_API_KEY"):
        return os.environ["FEATHERLESS_API_KEY"]

    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "FEATHERLESS_API_KEY":
                return value.strip().strip('"')

    raise RuntimeError("Add FEATHERLESS_API_KEY=... to the .env file in the repo root")


def send_to_ollama(question, instructions, model):
    body = {
        "model": model,
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
    print(f"{tokens_used} tokens used")
