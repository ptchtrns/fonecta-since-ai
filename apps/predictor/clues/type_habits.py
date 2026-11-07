"""Clue: how often businesses of the same type really close on this holiday, learned from the training data."""

# Suggest "closed" only when at least this share of same-type businesses were really closed.
# 0.8 scored best on both seasons; below 0.7 the wrong "closed" guesses cost more than the right ones earn.
MIN_CLOSED_RATE = 0.8

# Ignore groups with fewer days than this: a handful of businesses says little about a whole type.
MIN_DAYS = 10


def guess_from_type_habits(data, business, holiday):
    """Suggest "closed" when most businesses of the same type and country were closed on this holiday.

    Only for businesses that have never entered anything for this holiday: if the owner has told us
    what they do, their own history decides instead. The business's own past days are also left out
    of the rate, so its own answers never decide its guess.
    """
    if has_own_history(data, business, holiday):
        return None

    key =(business["meta"]["countryCode"], business["c_segment"], holiday)
    counts_per_business = data["true_closures"].get(key, {})

    days = 0
    closed_days = 0
    for business_id, (business_days, business_closed_days) in counts_per_business.items():
        if business_id == business["meta"]["id"]:
            continue
        days += business_days
        closed_days += business_closed_days

    if days < MIN_DAYS:
        return None

    closed_rate = closed_days / days
    if closed_rate < MIN_CLOSED_RATE:
        return None

    return {
        "hours": "closed",
        "confidence": closed_rate,
        "reason": f"{closed_rate:.0%} of similar businesses are closed on this day",
    }


def has_own_history(data, business, holiday):
    """Return True if the owner entered anything for this holiday before the snapshot date."""
    for entry in data["holiday_history"][(business["meta"]["id"], holiday)]:
        if entry["entered_at"] < data["snapshot"]:
            return True
    return False
