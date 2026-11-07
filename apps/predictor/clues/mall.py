"""Clue: shops in a shopping centre keep the centre's hours on days the centre has published.

Some shops keep their own hours instead, and their own past entries show which kind they are:
on earlier special days, did the shop enter the same hours as its centre?
"""

from hours import hours_to_text

# On days a centre published special hours, its shops used exactly those hours about 85% of the
# time (dev businesses, both seasons).
MALL_CONFIDENCE = 0.85

# When the shop's own past entries show whether it follows its centre.
FOLLOWS_CENTRE_CONFIDENCE = 0.95
KEEPS_OWN_HOURS_CONFIDENCE = 0.3


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
        "confidence": confidence_shop_follows(data, business, mall_id),
        "reason": f"{mall['name']} has published its hours for this day",
    }


def confidence_shop_follows(data, business, mall_id):
    """How sure we are that the shop uses its centre's hours, from the days both entered special hours."""
    shop_hours_by_date = {}
    for entry in data["holiday_history_by_business"][business["meta"]["id"]]:
        if entry["date"] < data["snapshot"]:
            shop_hours_by_date[entry["date"]] = hours_to_text(entry["holidayHours"])  # the last entry wins

    same = 0
    different = 0
    for past_day, shop_hours in shop_hours_by_date.items():
        mall_entries = data["holiday_history_by_date"].get((mall_id, past_day))
        if not mall_entries:
            continue
        if shop_hours == hours_to_text(mall_entries[-1]["holidayHours"]):
            same += 1
        else:
            different += 1

    if same == 0 and different == 0:
        return MALL_CONFIDENCE
    if same >= different:
        return FOLLOWS_CENTRE_CONFIDENCE
    return KEEPS_OWN_HOURS_CONFIDENCE
