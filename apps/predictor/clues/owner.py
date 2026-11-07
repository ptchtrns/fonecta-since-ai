"""Evidence about the owner as a whole, not one holiday: how much they use Connect and how they usually behave.

Never a guess on its own. The decider uses it to judge the other clues, for example how far to trust
last year's entry from an owner who hasn't entered anything for a year. A value of -1 means there
was nothing to go on.
"""

from datetime import date

from hours import hours_to_text

NOTHING = -1.0


def owner_evidence(data, business):
    """The same for every day of a business, so it's worked out once per business and kept in data."""
    known = data.setdefault("owner_evidence", {})
    business_id = business["meta"]["id"]
    if business_id not in known:
        known[business_id] = work_out_owner_evidence(data, business_id)
    return known[business_id]


def work_out_owner_evidence(data, business_id):
    snapshot = date.fromisoformat(data["snapshot"])

    entries = 0
    entries_last_year = 0
    closed_days = 0
    special_hours_days = 0
    for entry in data["holiday_history_by_business"][business_id]:
        if entry["date"] >= data["snapshot"]:
            continue
        entries += 1
        if (snapshot - date.fromisoformat(entry["date"])).days <= 365:
            entries_last_year += 1
        if entry["holidayHours"].get("isRegularHours"):
            continue
        if hours_to_text(entry["holidayHours"]) == "closed":
            closed_days += 1
        else:
            special_hours_days += 1

    # Hours the owner approved or edited in the web app this season tell us as much as their own entries.
    told = data["owner_answers"]["told"][business_id]
    for hours in told:
        entries += 1
        entries_last_year += 1
        if hours == "closed":
            closed_days += 1
        else:
            special_hours_days += 1

    evidence = {
        "owner_entries": float(entries),
        "owner_entries_last_year": float(entries_last_year),
        "owner_closed_share": NOTHING,
        "owner_special_share": NOTHING,
        "owner_days_since_entry": NOTHING,
        "google_edits": float(count_hours_edits(data, business_id)),
        "reviews": float(len(data["reviews"][business_id])),
    }

    days_with_exceptions = closed_days + special_hours_days
    if days_with_exceptions:
        evidence["owner_closed_share"] = closed_days / days_with_exceptions
        evidence["owner_special_share"] = special_hours_days / days_with_exceptions

    last_entry = data["last_owner_entry"].get(business_id)
    if told:
        evidence["owner_days_since_entry"] = 0.0
    elif last_entry:
        evidence["owner_days_since_entry"] = float((snapshot - date.fromisoformat(last_entry[:10])).days)
    return evidence


def count_hours_edits(data, business_id):
    count = 0
    for edit in data["google_user_edits"][business_id]:
        if edit["fieldName"] == "hours":
            count += 1
    return count
