"""Clue: a customer wrote down the business's new normal hours, like "Now only open Mon-Fri 10-18, Sat 10-15".

When an owner changes their normal hours and forgets the listing, customers notice. Some reviews state the
new week outright, in Finnish, Swedish, Norwegian or English. Days the review doesn't name are closed: "only
open Mon-Thu 8-16" means closed on Fridays. The newest such review counts.

On the dev businesses these reviews matched the true current hours on every weekday (112 of 112).
Suggesting them on days the decider stays quiet was right 35 times out of 47 in 2026 (9 more had the
right open/closed state) and 7 out of 9 in 2025.

Past seasons have almost no such reviews, so the decider can't learn how far to trust this clue. run.py
uses it on days the decider leaves alone.
"""

import re

from hours import WEEKDAYS, weekday_of

# Measured above: right about three times out of four on the days it's used.
STATED_HOURS_CONFIDENCE = 0.75

# Day names in the four languages, as a weekday number (Monday is 0).
DAY_NUMBERS = {
    "ma": 0, "ti": 1, "ke": 2, "to": 3, "pe": 4, "la": 5, "su": 6,
    "mån": 0, "tis": 1, "ons": 2, "tor": 3, "fre": 4, "lör": 5, "sön": 6,
    "man": 0, "tir": 1, "lør": 5, "søn": 6,
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}

# "Now only open" in each language, followed by the week.
STATEMENT = re.compile(r"(nykyään auki vain|numera öppet bara|nå bare åpent|now only open)\s+(.*)", re.IGNORECASE)

# One part of the week: a day or a range of days, then hours, maybe in two parts.
# Matches "ma–pe 7.30–18", "Sat 11:00–16:00" and "mån–fre 11–14 och 17–22".
# Longer day names come first, so "mån" isn't read as "ma".
DAY = r"(mån|tis|ons|tor|fre|lör|sön|man|tir|lør|søn|mon|tue|wed|thu|fri|sat|sun|ma|ti|ke|to|pe|la|su)"
TIME = r"(\d{1,2}(?:[.:]\d{2})?)"
DASH = r"\s*[–-]\s*"
AND = r"\s*(?:och|ja|og|and)\s*"
WEEK_PART = re.compile(rf"{DAY}(?:{DASH}{DAY})?\s+{TIME}{DASH}{TIME}(?:{AND}{TIME}{DASH}{TIME})?", re.IGNORECASE)


def guess_from_stated_hours(data, business, day):
    week = stated_week(data, business)
    if week is None:
        return None
    hours = week[WEEKDAYS.index(weekday_of(day))]
    if hours == "closed":
        reason = "A customer reported that you're now closed on this weekday"
    else:
        reason = f"A customer reported that you're now open {hours} on this weekday"
    return {"hours": hours, "confidence": STATED_HOURS_CONFIDENCE, "reason": reason}


def stated_week(data, business):
    """The hours for each weekday from the newest review that states them, or None. Worked out once per business."""
    known = data.setdefault("stated_weeks", {})
    business_id = business["meta"]["id"]
    if business_id not in known:
        week = None
        for review in sorted(data["reviews"][business_id], key=lambda review: review["written_on"]):
            week = read_week(review["content"] or "") or week
        known[business_id] = week
    return known[business_id]


def read_week(text):
    """["10:00-18:00", ..., "closed"] for Monday to Sunday from a "now only open ..." text, or None."""
    statement = STATEMENT.search(text)
    if not statement:
        return None

    week = ["closed"] * 7
    found = False
    for part in WEEK_PART.finditer(statement.group(2)):
        first_day, last_day, opens, closes, opens_again, closes_again = part.groups()
        hours = f"{clock(opens)}-{clock(closes)}"
        if opens_again:
            hours += f",{clock(opens_again)}-{clock(closes_again)}"
        start = DAY_NUMBERS[first_day.lower()]
        end = DAY_NUMBERS[last_day.lower()] if last_day else start
        for weekday in range(start, end + 1):
            week[weekday] = hours
            found = True
    if not found:
        return None
    return week


def clock(text):
    """"7.30" or "7:30" or "7" as "07:30" or "07:00"."""
    hours, _, minutes = text.replace(".", ":").partition(":")
    return f"{int(hours):02d}:{minutes or '00'}"
