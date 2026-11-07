"""Clue: for owners who never told us about a holiday, how often their type of business closes on it.

The rates come from the true hours of the dev businesses (labels/dev_truth_history.csv), which the
challenge gives as training data.
"""

# 0.8 scored best on both seasons. At 0.5-0.7 the wrong "closed" guesses cost more than the right ones earned.
MIN_CLOSED_RATE = 0.8

# A group needs at least this many days before its rate means anything.
MIN_DAYS = 10


def guess_from_type_habits(data, business, holiday):
    business_id = business["meta"]["id"]

    # The owner's own entries decide instead, when there are any.
    if data["holiday_history"][(business_id, holiday)]:
        return None

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

    closed_rate = closed_days / days
    if closed_rate < MIN_CLOSED_RATE:
        return None

    return {
        "hours": "closed",
        "confidence": closed_rate,
        "reason": f"{closed_rate:.0%} of similar businesses are closed on this day",
    }
