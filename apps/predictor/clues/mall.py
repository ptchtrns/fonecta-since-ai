"""Clue: shops inside a shopping centre follow the centre's published hours."""

from hours import hours_to_text

# How often shops used the centre's exact hours on days the centre published special hours,
# measured on the dev businesses in both seasons.
MALL_CONFIDENCE = 0.85


def guess_from_mall(data, business, day):
    """Suggest the shopping centre's hours for this day, if the shop is in one that has published them.

    Returns None if the shop isn't in a shopping centre, or the centre hasn't published anything
    special for this day.
    """
    mall_id = business.get("c_shoppingCenterEntityId")
    if not mall_id:
        return None

    mall_hours = None
    for entry in data["holiday_history_by_date"][(mall_id, day)]:
        if entry["entered_at"] < data["snapshot"]:
            mall_hours = entry["holidayHours"]

    if not mall_hours or mall_hours.get("isRegularHours"):
        return None

    mall_name = data["businesses"][mall_id]["name"]
    return {
        "hours": hours_to_text(mall_hours),
        "confidence": MALL_CONFIDENCE,
        "reason": f"{mall_name} has published its hours for this day",
    }
