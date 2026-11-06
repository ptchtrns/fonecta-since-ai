"""Reads customer reviews: is a review about opening hours, and what did the customer find?"""

import ai

# Words that show a review is about opening hours or a closed door, in Finnish, Swedish, Norwegian and English.
HOURS_WORDS = [
    "kiinni", "suljet", "aukiolo", "auki",
    "stängt", "stängd", "öppettid", "öppet",
    "stengt", "åpningstid", "åpent",
    "closed", "opening hours", "open",
]

ANSWERS = ["closed", "closed_early", "open", "permanently_closed", "unknown"]

# Instructions for the language model. The word table helps a small model with Finnish,
# which it otherwise often reads the wrong way round ("kiinni" as open).
INSTRUCTIONS = """You read one customer review of a business. Decide what the customer found when they came.

Useful words:
| Language  | closed                  | open           | closed early / already closed at | for good    |
|-----------|-------------------------|----------------|----------------------------------|-------------|
| Finnish   | kiinni, suljettu        | auki, avoinna  | jo kiinni klo, suljettiin jo     | pysyvästi   |
| Swedish   | stängt, stängd          | öppet          | stängde redan, redan stängt      | för gott    |
| Norwegian | stengt                  | åpent          | stengte allerede                 | for godt    |
| English   | closed                  | open           | closed already at                | permanently |

Answer only with JSON: {"found": "closed" | "closed_early" | "open" | "permanently_closed" | "unknown"}
- closed: the doors were closed the whole day
- closed_early: it closed earlier than the hours shown online
- open: it was open, even though online it said closed
- permanently_closed: the business has shut down for good
- unknown: none of the above"""


def is_about_hours(review_text):
    """Return True if the review mentions opening hours or a closed door."""
    text = review_text.lower()
    for word in HOURS_WORDS:
        if word in text:
            return True
    return False


def what_customer_found(review_text):
    """Ask the language model what the customer found: one of ANSWERS."""
    answer = ai.ask_for_json(f'Review: "{review_text}"', INSTRUCTIONS).get("found")
    if answer not in ANSWERS:
        return "unknown"
    return answer
