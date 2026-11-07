"""Turns the guesses from all clues into one."""

from collections import defaultdict


def combine(guesses):
    """The hours the clues are most sure about, or None if no clue had a guess.

    Clues that suggest the same hours back each other up: two clues at 0.7 give
    1 - 0.3 * 0.3 = 0.91, as if they were independent chances of being right.
    """
    guesses_by_hours = defaultdict(list)
    for guess in guesses:
        if guess is not None:
            guesses_by_hours[guess["hours"]].append(guess)

    best = None
    for hours, agreeing in guesses_by_hours.items():
        confidence = combined_confidence(agreeing)
        if best is None or confidence > best["confidence"]:
            best = {
                "hours": hours,
                "confidence": confidence,
                "reasons": [guess["reason"] for guess in agreeing],
            }
    return best


def combined_confidence(agreeing_guesses):
    chance_all_wrong = 1
    for guess in agreeing_guesses:
        chance_all_wrong *= 1 - guess["confidence"]
    return 1 - chance_all_wrong
