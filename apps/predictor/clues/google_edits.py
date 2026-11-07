"""Clue: a Google user suggested hours for this holiday the last time it came round.

People who suggest an edit were usually there: on dev businesses these edits matched what really
happened that day about 9 times out of 10, even the ones the owner rejected. But owners don't always
do the same thing again, so the confidence is lower than for the owner's own entries or the
shopping centre's hours, which win when they disagree.
"""

import json
from datetime import date, timedelta

from hours import hours_to_text

# Used alone, an edit for last time's holiday matched this year's hours about half the time.
# 0.4-0.5 scored best on both seasons.
EDIT_CONFIDENCE = 0.5

# 400 days covers last year's whole season, including Easter, which moves around.
MAX_EDIT_AGE_DAYS = 400


def guess_from_google_edits(data, business, holiday):
    country = business["meta"]["countryCode"]
    oldest_allowed = (date.fromisoformat(data["snapshot"]) - timedelta(days=MAX_EDIT_AGE_DAYS)).isoformat()

    newest = None
    for edit in data["google_user_edits"][business["meta"]["id"]]:
        if edit["fieldName"] != "hours":
            continue
        for special_day in json.loads(edit["suggestedContent"]).get("holidayHours", []):
            day = special_day["date"]
            is_this_holiday = data["holiday_on"].get((country, day)) == holiday
            if is_this_holiday and oldest_allowed <= day < data["snapshot"]:
                if newest is None or day > newest["date"]:
                    newest = special_day

    if newest is None:
        return None

    return {
        "hours": hours_to_text(newest),
        "confidence": EDIT_CONFIDENCE,
        "reason": f"A Google user reported these hours for {newest['date']}, the last time this day came round",
    }
