from hours import hours_to_text, normal_hours

YEAR_WEIGHT_DECAY = 0.7


def guess_from_last_year(data, business, holiday, day):
    """Suggests what the owner entered for this holiday most recently."""
    answers = answers_per_year(data, business, holiday)
    if not answers:
        return None

    newest_date, newest = answers[-1]
    if newest == "regular":
        hours = normal_hours(data, business, day)
    else:
        hours = adjust_to_this_weekday(data, business, newest, newest_date, day)

    return {
        "hours": hours,
        "confidence": how_much_years_agree([answer for _, answer in answers], newest),
        "reason": "Based on what you entered for this day in previous years",
    }


def answers_per_year(data, business, holiday):
    """What the owner entered for this holiday each year, oldest first, as (date, answer).
    "regular" means normal hours."""
    business_id = business["meta"]["id"]
    snapshot = data["snapshot"]

    answer_per_date = {}
    for entry in data["holiday_history"][(business_id, holiday)]:
        if entry["date"] < snapshot and entry["entered_at"] < snapshot:
            if entry["holidayHours"].get("isRegularHours"):
                answer_per_date[entry["date"]] = "regular"
            else:
                answer_per_date[entry["date"]] = hours_to_text(entry["holidayHours"])

    return [(past_date, answer_per_date[past_date]) for past_date in sorted(answer_per_date)]


def adjust_to_this_weekday(data, business, past_hours, past_date, day):
    """If last time the owner kept that weekday's normal opening or closing time,
    keep this weekday's normal time instead.

    Example: normal hours Sunday 12-18, Thursday 10-20. Last NYE (a Sunday) was 12-17.
    This NYE is a Thursday, so the guess is 10-17, not 12-17.
    """
    normal_then = normal_hours(data, business, past_date, as_of=past_date)
    normal_now = normal_hours(data, business, day)

    only_one_interval = "," not in past_hours + normal_then + normal_now
    all_open = "closed" not in (past_hours, normal_then, normal_now)
    if not (only_one_interval and all_open):
        return past_hours

    opens, closes = past_hours.split("-")
    normal_opens_then, normal_closes_then = normal_then.split("-")
    normal_opens_now, normal_closes_now = normal_now.split("-")

    if opens == normal_opens_then:
        opens = normal_opens_now
    if closes == normal_closes_then:
        closes = normal_closes_now

    return f"{opens}-{closes}"


def how_much_years_agree(answers, newest):
    """Share of years that agree with the newest one. Recent years count more."""
    total = 0
    agreeing = 0
    weight = 1

    for answer in reversed(answers):
        total += weight
        if answer == newest:
            agreeing += weight
        weight *= YEAR_WEIGHT_DECAY

    return agreeing / total
