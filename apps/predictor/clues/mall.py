"""Clue: shops in a shopping centre keep the centre's hours on days the centre has published."""

from hours import hours_to_text

# On days a centre published special hours, its shops used exactly those hours about 85% of the
# time (dev businesses, both seasons).
MALL_CONFIDENCE = 0.85


def guess_from_mall(data, business, day):
    mall_id = business.get("c_shoppingCenterEntityId")
    if not mall_id:
        return None

    entries = data["holiday_history_by_date"][(mall_id, day)]
    if not entries:
        return None

    mall_hours = entries[-1]["holidayHours"]
    if mall_hours.get("isRegularHours"):
        return None

    mall = data["businesses"][mall_id]
    return {
        "hours": hours_to_text(mall_hours),
        "confidence": MALL_CONFIDENCE,
        "reason": f"{mall['name']} has published its hours for this day",
    }
