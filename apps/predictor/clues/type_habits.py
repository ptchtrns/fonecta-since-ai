"""Clue: for owners who never told us about a holiday, how often their type of business closes on it.

The rates come from the true hours of the dev businesses (labels/dev_truth_history.csv), which the
challenge gives as training data.
"""

# 0.8 scored best on both seasons. At 0.5-0.7 the wrong "closed" guesses cost more than the right ones earned.
MIN_CLOSED_RATE = 0.8

# A group needs at least this many days before its rate means anything.
MIN_DAYS = 10


def guess_from_type_habits(data, business, holiday):
    # The owner's own entries decide instead, when there are any.
    if data["holiday_history"][(business["meta"]["id"], holiday)]:
        return None

    closed_rate = type_closed_rate(data, business, holiday)
    if closed_rate is None or closed_rate < MIN_CLOSED_RATE:
        return None

    return {
        "hours": "closed",
        "confidence": closed_rate,
        "reason": f"{closed_rate:.0%} of businesses like yours were closed on this day in earlier years",
    }


def type_closed_rate(data, business, holiday):
    """The share of days businesses of this type and country were really closed on this holiday, or None
    if there are fewer than MIN_DAYS days to go on."""
    business_id = business["meta"]["id"]
    group = (business["meta"]["countryCode"], business["c_segment"], holiday)

    days = 0
    closed_days = 0
    for other_id, (other_days, other_closed_days) in data["true_closures"].get(group, {}).items():
        # Leave the business itself out, so a dev business never learns from its own answers.
        if other_id != business_id:
            days += other_days
            closed_days += other_closed_days

    if days < MIN_DAYS:
        return None
    return closed_days / days
