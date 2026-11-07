"""Reading customer reviews: is a review about opening hours, what did the customer find, and when?"""

import re

import ai

# A review mentioning any of these is about opening hours, a closed door or a business that shut down.
# Many customers describe a closed door as "everything was dark" (pimeä, släckt, mörkt, mørkt, dark).
# This only picks which reviews the language model reads; the model decides what they say.
HOURS_WORDS = [
    "kiinni", "suljet", "aukiolo", "auki", "lopett", "pysyvä", "pimeä",
    "stängt", "stängd", "öppettid", "öppet", "för gott", "släckt", "mörkt",
    "stengt", "åpningstid", "åpent", "lagt ned", "for godt", "mørkt",
    "closed", "opening hours", "open", "permanent", "dark",
]

# Finnish businesses get reviews in Finnish and English. Mistral-Small misread Finnish ("Kiva että olitte
# auki", glad you were open, as "I wish you had been open"); Qwen2.5-72B read all 13 of its mistakes right.
# Mistral-Small reads Swedish and Norwegian well and is cheaper and faster.
READING_MODELS = {
    "FI": "Qwen/Qwen2.5-72B-Instruct",
    "SE": "mistralai/Mistral-Small-24B-Instruct-2501",
    "NO": "mistralai/Mistral-Small-24B-Instruct-2501",
}

ANSWERS = ["closed", "closed_early", "opened_late", "open", "permanently_closed", "unknown"]
ANSWERS_WITH_TIMES = ["closed_early", "opened_late"]
TIMES = ["opened_at", "closed_at", "arrived_at"]

# Two short questions instead of one long one: asking for the times in the same question made the
# model invent times and then answer closed_early.
# Kept short on purpose: we only add what the mistakes show is missing. Changing either text makes
# every review get asked again.
INSTRUCTIONS = """Read a customer review of a business. What did the customer find when they came?
Go by what the customer found, not by what Google or the website said.

First write the review in English, then decide.
Answer only with JSON: {"in_english": "<the review in English>", "found": "closed" | "closed_early" | "opened_late" | "open" | "permanently_closed" | "unknown"}
- closed: closed that day ("the doors were shut", "the place was dark", "it wasn't open", "Google said 9–17, but it was closed")
- closed_early: open that day, but closed earlier than shown online ("already closed at 16")
- opened_late: open that day, but opened later than shown online ("still closed at 9")
- open: open, for example although Google said closed
- permanently_closed: shut down for good, not just for a season
- unknown: anything else"""

TIME_INSTRUCTIONS = """A customer review says a business closed earlier or opened later than Google showed. Which times does the review give for that day?

Answer only with JSON: {"opened_at": "HH:MM" or null, "closed_at": "HH:MM" or null, "arrived_at": "HH:MM" or null}
- opened_at: when the business opened
- closed_at: when the business closed
- arrived_at: when the customer came
Use null when the review doesn't say. A range like "10–18" is what Google showed, not an opening or closing time.
When the customer only says when they came and found it already closed, that time is arrived_at, not closed_at."""


def is_about_hours(review_text):
    text = review_text.lower()
    for word in HOURS_WORDS:
        if word in text:
            return True
    return False


def read_review(review_text, country):
    """What the customer found, and the times the review gives, decided by the language model.

    {"found": one of ANSWERS, "opened_at": "11:00" or None, "closed_at": ..., "arrived_at": ...}
    Times are only asked for when the business closed early or opened late.
    """
    model = READING_MODELS[country]
    reading = {"found": what_customer_found(review_text, model)}
    for name in TIMES:
        reading[name] = None

    if reading["found"] in ANSWERS_WITH_TIMES:
        times = ai.ask(question_about(review_text), TIME_INSTRUCTIONS, model)
        for name in TIMES:
            reading[name] = clock_time(times.get(name))
    return reading


def what_customer_found(review_text, model):
    found = ai.ask(question_about(review_text), INSTRUCTIONS, model).get("found")
    if found not in ANSWERS:
        return "unknown"
    return found


def clock_time(value):
    """Turn "16", "16.20" or "16:20" into "16:00" or "16:20", and anything else into None."""
    match = re.fullmatch(r"(\d{1,2})(?:[:.](\d{2}))?", str(value or "").strip())
    if not match or int(match.group(1)) > 24:
        return None
    return f"{int(match.group(1)):02d}:{match.group(2) or '00'}"


def already_read(review_text, country):
    """True if the model's answers for this review are already in the cache."""
    model = READING_MODELS[country]
    question = question_about(review_text)
    if not ai.is_cached(question, INSTRUCTIONS, model):
        return False
    return not needs_times(review_text, model) or ai.is_cached(question, TIME_INSTRUCTIONS, model)


def needs_times(review_text, model):
    """Only call once the first question has been answered."""
    return what_customer_found(review_text, model) in ANSWERS_WITH_TIMES


def question_about(review_text):
    return f"<review>{review_text}</review>"
