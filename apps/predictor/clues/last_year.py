"""Clue: do what the owner entered for this holiday the last time it came round."""

from datetime import date

from hours import hours_to_text, is_one_interval, normal_hours

# Each year further back counts this much less when measuring how consistent the owner is.
# Below 1, so a recent change of habit outweighs many old years.
YEAR_WEIGHT_DECAY = 0.7

# Confidence is multiplied by this for every year the owner skipped since their newest entry: an owner
# who stopped entering a holiday may have changed their habit.
SKIPPED_YEAR_DECAY = 0.7

# Stands for an entry where the owner said "normal hours" for the day.
NORMAL_HOURS = "normal"


def guess_from_last_year(data, business, holiday, day):
    answers = past_answers(data, business, holiday)
    if not answers:
        return None

    newest_day, newest = answers[-1]
    if newest == NORMAL_HOURS:
        hours = normal_hours(data, business, day)
    else:
        hours = adjust_to_this_weekday(data, business, newest, newest_day, day)

    years_since_newest = (date.fromisoformat(day) - date.fromisoformat(newest_day)).days / 365
    skipped_years = max(0, round(years_since_newest) - 1)
    confidence = consistency([answer for _, answer in answers]) * SKIPPED_YEAR_DECAY ** skipped_years

    return {
        "hours": hours,
        "confidence": confidence,
        "reason": "Based on what you entered for this day in previous years",
    }


def last_year_evidence(data, business, holiday):
    """How much the owner's own history says about this holiday, also when it's thin, for the decider.
    -1 when there is no history."""
    answers = past_answers(data, business, holiday)
    if not answers:
        return {"own_years": 0.0, "own_entries": 0.0, "own_years_since_newest": -1.0, "own_consistency": -1.0}

    years = set()
    for day, _ in answers:
        years.add(day[:4])

    # Years between the snapshot and the newest entry. -1 for an entry from the snapshot's own year,
    # like a January holiday; capped at 3, as older entries say little more.
    newest_year = int(answers[-1][0][:4])
    years_since = int(data["snapshot"][:4]) - newest_year
    years_since = max(-1, min(years_since, 3))

    return {
        "own_years": float(len(years)),
        "own_entries": float(len(answers)),
        "own_years_since_newest": float(years_since),
        "own_consistency": consistency([answer for _, answer in answers]),
    }


def past_answers(data, business, holiday):
    """What the owner entered for this holiday in past years, as [(day, hours)], oldest first.

    hours is text like "10:00-17:00" or "closed", or NORMAL_HOURS.
    """
    answer_per_day = {}
    for entry in data["holiday_history"][(business["meta"]["id"], holiday)]:
        if entry["date"] >= data["snapshot"]:
            continue  # entered early for the coming season, not a past year

        if entry["holidayHours"].get("isRegularHours"):
            answer_per_day[entry["date"]] = NORMAL_HOURS
        else:
            answer_per_day[entry["date"]] = hours_to_text(entry["holidayHours"])

    return sorted(answer_per_day.items())


def adjust_to_this_weekday(data, business, past_hours, past_day, day):
    """Where the past hours just followed that weekday's normal opening or closing time, use this year's.

    Normal hours Sunday 12-18 and Thursday 10-20: last NYE was a Sunday and the owner entered 12-17.
    This NYE is a Thursday, so the guess is 10-17 ("normal opening, close at 17"), not 12-17.
    """
    normal_then = normal_hours(data, business, past_day, as_of=past_day)
    normal_now = normal_hours(data, business, day)
    if not (is_one_interval(past_hours) and is_one_interval(normal_then) and is_one_interval(normal_now)):
        return past_hours

    opens, closes = past_hours.split("-")
    normal_opens_then, normal_closes_then = normal_then.split("-")
    normal_opens_now, normal_closes_now = normal_now.split("-")

    if opens == normal_opens_then:
        opens = normal_opens_now
    if closes == normal_closes_then:
        closes = normal_closes_now

    return f"{opens}-{closes}"


def consistency(answers):
    """How much the past years agree with the newest one, from 0 to 1. Recent years count more."""
    newest = answers[-1]
    total = 0
    agreeing = 0
    weight = 1

    for answer in reversed(answers):
        total += weight
        if answer == newest:
            agreeing += weight
        weight *= YEAR_WEIGHT_DECAY

    return agreeing / total
