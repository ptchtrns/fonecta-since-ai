from datetime import date

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
TODAY = "2026-11-06"


def hours_to_text(hours):
    """Turns the data's hours format into text like "10:00-14:00,17:00-22:00" or "closed"."""
    if not hours or hours.get("isClosed") or not hours.get("openIntervals"):
        return "closed"

    parts = []
    for interval in hours["openIntervals"]:
        parts.append(interval["start"] + "-" + interval["end"])

    return ",".join(parts)


def weekday_of(day):
    return WEEKDAYS[date.fromisoformat(day).weekday()]


def normal_hours(data, business, day, as_of=None):
    """The business's normal hours for the weekday of this day, as published on as_of (default: the snapshot)."""
    as_of = as_of or data["snapshot"]
    published = [
        version for version in data["regular_hours_history"][business["meta"]["id"]]
        if version["effective_from"] == "before-2024" or version["effective_from"] < as_of
    ]
    newest = max(published, key=lambda version: version["effective_from"].replace("before-2024", "0000"))
    return hours_to_text(newest["hours"].get(weekday_of(day)))


def shown_on_google(data, business, day):
    """What Google showed for this business on this day, as of the snapshot date."""
    if data["snapshot"] == TODAY:
        return shown_on_google_today(business, day)

    special_days = [
        entry for entry in data["holiday_history_by_date"][(business["meta"]["id"], day)]
        if entry["entered_at"] < data["snapshot"]
    ]
    if special_days and not special_days[-1]["holidayHours"].get("isRegularHours"):
        return hours_to_text(special_days[-1]["holidayHours"])

    return normal_hours(data, business, day)


def shown_on_google_today(business, day):
    hours = business["hours"]
    closed_for_good = business.get("closed")
    on_seasonal_break = hours.get("reopenDate") and day < hours["reopenDate"]

    if closed_for_good or on_seasonal_break:
        return "closed"

    for special_day in hours.get("holidayHours", []):
        if special_day["date"] == day and not special_day.get("isRegularHours"):
            return hours_to_text(special_day)

    return hours_to_text(hours.get(weekday_of(day)))
