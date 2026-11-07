"""Clue: businesses that close for the same part of every year, like summer terraces in winter and ski
rentals in summer.

Owners publish such a break as weekly hours with every day closed. If the business was on its break
on the same date in earlier years, suggest closed. That catches owners who forget to publish this
year's break, in any season.

A business that has never published a break may still be seasonal. Then its type decides: if other
businesses of that type publish seasonal breaks, and that type was almost always closed in this month
(learned from the training data), suggest closed. The first condition matters: the training data only
has special days, so offices look "closed all of May" just because May's special days are public holidays.
"""

from hours import published_breaks

YEARS_BACK = 3

# A type counts as closed for the whole month only if this many of its special days that month were closed.
MIN_SEASON_RATE = 0.95
MIN_DAYS = 20


def guess_from_seasonal_break(data, business, day):
    breaks = published_breaks(data["regular_hours_history"][business["meta"]["id"]])
    if breaks:
        return guess_from_own_breaks(breaks, day)
    return guess_from_type_season(data, business, day)


def guess_from_own_breaks(breaks, day):
    first_known = min(start for start, _ in breaks)
    years_known = 0
    years_on_break = 0
    for years_ago in range(1, YEARS_BACK + 1):
        same_day = str(int(day[:4]) - years_ago) + day[4:]
        if same_day < first_known:
            continue
        years_known += 1
        if any(start <= same_day < end for start, end in breaks):
            years_on_break += 1

    if years_on_break == 0 or years_on_break < years_known:
        return None  # no break on this date before, or not every year

    if years_on_break == 1:
        reason = "You were closed at this time of year last year"
    else:
        reason = f"You have been closed at this time of year for the last {years_on_break} years"
    return {
        "hours": "closed",
        "confidence": 1 - 0.5 ** (years_on_break + 1),  # 1 year 0.75, 2 years 0.875, 3 years 0.94
        "reason": reason,
    }


def guess_from_type_season(data, business, day):
    if business["c_segment"] not in data["seasonal_types"]:
        return None

    business_id = business["meta"]["id"]
    group = (business["c_segment"], int(day[5:7]))

    days = 0
    closed_days = 0
    for other_id, (other_days, other_closed_days) in data["true_closures_by_month"].get(group, {}).items():
        # Leave the business itself out, so a dev business never learns from its own answers.
        if other_id != business_id:
            days += other_days
            closed_days += other_closed_days

    if days < MIN_DAYS or closed_days / days < MIN_SEASON_RATE:
        return None

    return {
        "hours": "closed",
        "confidence": closed_days / days,
        "reason": "Businesses like yours are closed at this time of year",
    }
