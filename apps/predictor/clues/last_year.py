from hours import hours_to_text, normal_hours

SNAPSHOT = "2026-11-06"


def guess_from_last_year(data, business, holiday, day):
    """The hours the owner entered the last time this holiday came round, or None."""
    business_id = business["meta"]["id"]
    past_entries = [
        entry for entry in data["holiday_history"][(business_id, holiday)]
        if entry["date"] < SNAPSHOT and entry["entered_at"] < SNAPSHOT
    ]
    if not past_entries:
        return None

    latest_date = max(entry["date"] for entry in past_entries)
    latest = [entry for entry in past_entries if entry["date"] == latest_date][-1]

    if latest["holidayHours"].get("isRegularHours"):
        return normal_hours(business, day)

    return hours_to_text(latest["holidayHours"])
