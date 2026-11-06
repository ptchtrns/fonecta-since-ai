from datetime import date

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def hours_to_text(hours):
    """Turns the data's hours format into text like "10:00-14:00,17:00-22:00" or "closed"."""
    if not hours or hours.get("isClosed") or not hours.get("openIntervals"):
        return "closed"

    parts = []
    for interval in hours["openIntervals"]:
        parts.append(interval["start"] + "-" + interval["end"])

    return ",".join(parts)


def normal_hours(business, day):
    """The business's normal weekly hours for the weekday of this day."""
    weekday = WEEKDAYS[date.fromisoformat(day).weekday()]
    return hours_to_text(business["hours"].get(weekday))


def shown_on_google(business, day):
    hours = business["hours"]
    closed_for_good = business.get("closed")
    on_seasonal_break = hours.get("reopenDate") and day < hours["reopenDate"]

    if closed_for_good or on_seasonal_break:
        return "closed"

    for special_day in hours.get("holidayHours", []):
        if special_day["date"] == day and not special_day.get("isRegularHours"):
            return hours_to_text(special_day)

    return normal_hours(business, day)
