"""Flag businesses that seem to have shut down for good while Google still shows them open.

A flag goes to a person at Connect, who checks and marks the listing closed. A wrong flag costs
little, so one clear sign is enough: a customer review saying the business has shut down, or a
Google user reporting it closed.
"""

from datetime import date, timedelta

from clues.reviews import recent_reviews
from holiday_names import find_holiday
from review_reading import is_about_hours, read_review

# An older sign could be about a business that has since reopened.
MAX_SIGN_AGE_DAYS = 365


def flag_if_closed_for_good(data, business):
    """{"action": "FLAG", "reasons": [...]} if the business seems to have shut down, otherwise None."""
    if business.get("closed"):
        return None  # Google already shows it closed

    signs = shutdown_signs(data, business)
    if not signs:
        return None

    newest_sign = max(day for day, _ in signs)
    if data["last_owner_entry"].get(business["meta"]["id"], "") > newest_sign:
        return None  # the owner has entered hours since, so the business is still running

    return {"action": "FLAG", "reasons": [reason for _, reason in sorted(signs)]}


def shutdown_signs(data, business):
    """[(day, reason)] for each sign from the last MAX_SIGN_AGE_DAYS that the business has shut down."""
    oldest_allowed = date.fromisoformat(data["snapshot"]) - timedelta(days=MAX_SIGN_AGE_DAYS)
    signs = []

    for review in recent_reviews(data, business):
        text = review["content"]
        if not text or review["written_on"] < oldest_allowed or not is_about_hours(text):
            continue
        if find_holiday(text):
            continue  # a review that names a holiday is about that day, not about shutting down
        if read_review(text, business["meta"]["countryCode"])["found"] == "permanently_closed":
            day = review["written_on"].isoformat()
            signs.append((day, f"A customer wrote on {day} that the business has shut down"))

    for edit in data["google_user_edits"][business["meta"]["id"]]:
        reports_closed = edit["fieldName"] == "closed" and edit["suggestedContent"] == "true"
        if reports_closed and edit["dateCreated"] >= oldest_allowed.isoformat():
            signs.append((edit["dateCreated"], f"A Google user reported it closed on {edit['dateCreated']}"))

    return signs
