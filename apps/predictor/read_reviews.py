"""Reads the reviews the reviews clue needs, one batch at a time, so cost and mistakes can be checked as we go.

    python3 apps/predictor/read_reviews.py 100      # read the next 100 unread reviews
    python3 apps/predictor/read_reviews.py clean    # drop cached answers that nothing uses any more

The answers go into ai_cache.json, and run.py uses them without asking again.
"""

import random
import sys
from collections import Counter

import ai
from clues.reviews import recent_reviews
from load import load_everything
from review_reading import (
    INSTRUCTIONS,
    READING_MODELS,
    TIME_INSTRUCTIONS,
    already_read,
    is_about_hours,
    needs_times,
    question_about,
    read_review,
)

SNAPSHOTS = ["2026-11-06", "2025-11-06"]


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "clean":
        clean_cache()
        return
    batch_size = int(sys.argv[1]) if len(sys.argv) > 1 else 100

    reviews = reviews_the_clue_reads()
    unread = [(text, country) for text, country in reviews if not already_read(text, country)]
    batch = unread[:batch_size]

    for model in sorted(set(READING_MODELS.values())):
        texts = [text for text, country in batch if READING_MODELS[country] == model]
        ai.ask_many([question_about(text) for text in texts], INSTRUCTIONS, model)
        ai.ask_many([question_about(text) for text in texts if needs_times(text, model)], TIME_INSTRUCTIONS, model)

    read = [(text, country) for text, country in reviews if already_read(text, country)]
    print(f"Read {len(batch)} reviews now ({ai.tokens_used} tokens).")
    print(f"{len(read)} of {len(reviews)} read, {len(reviews) - len(read)} left.")
    print("Answers so far:", dict(Counter(read_review(text, country)["found"] for text, country in read)))


def reviews_the_clue_reads():
    """Every different (review text, country) the clues ask about, in both seasons.

    That's every recent review about opening hours or a shutdown: the reviews clue uses the ones that
    name a holiday, closed_for_good the ones saying the business shut down. The country decides which
    model reads the review. Shuffled in a fixed order, so every batch has a mix of languages and wordings.
    """
    reviews = set()
    for snapshot in SNAPSHOTS:
        data = load_everything(snapshot)
        for business in data["businesses"].values():
            for review in recent_reviews(data, business):
                text = review["content"]
                if text and is_about_hours(text):
                    reviews.add((text, business["meta"]["countryCode"]))

    reviews = sorted(reviews)
    random.Random(0).shuffle(reviews)
    return reviews


def clean_cache():
    """Keep only the answers the clues use: the current instructions, asked of the model for that country."""
    needed = set()
    for text, country in reviews_the_clue_reads():
        for instructions in [INSTRUCTIONS, TIME_INSTRUCTIONS]:
            needed.add(ai.cache_key(question_about(text), instructions, READING_MODELS[country]))

    before = len(ai.cache)
    for key in list(ai.cache):
        if key not in needed:
            del ai.cache[key]
    ai.save_cache()
    print(f"Removed {before - len(ai.cache)} unused answers, kept {len(ai.cache)}.")


if __name__ == "__main__":
    main()
