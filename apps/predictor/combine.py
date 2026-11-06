"""Combines the guesses from all clues into one decision."""


def combine(guesses):
    """Pick the hours the clues are most confident about, or None if no clue had anything to say.

    Clues that suggest the same hours back each other up: their confidences are combined as
    independent chances of being right, 1 - (1 - c1) * (1 - c2) * ..., so two clues at 0.7
    give 0.91. The combined guess keeps the reasons of every clue that agreed.
    """
    by_hours = {}
    for guess in guesses:
        if guess is None:
            continue
        if guess["hours"] not in by_hours:
            by_hours[guess["hours"]] = []
        by_hours[guess["hours"]].append(guess)

    best = None
    for hours, agreeing in by_hours.items():
        chance_all_wrong = 1
        for guess in agreeing:
            chance_all_wrong *= 1 - guess["confidence"]

        candidate = {
            "hours": hours,
            "confidence": 1 - chance_all_wrong,
            "reasons": [guess["reason"] for guess in agreeing],
        }
        if best is None or candidate["confidence"] > best["confidence"]:
            best = candidate

    return best
