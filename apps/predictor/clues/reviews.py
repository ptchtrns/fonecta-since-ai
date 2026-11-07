"""Clue: a customer found the doors closed on this holiday last year."""

from datetime import date, timedelta

from holiday_names import find_holiday
from review_reading import is_about_hours, what_customer_found

# Older reviews describe how the business ran too long ago. 400 days covers last year's whole
# season, including Easter, which moves around.
MAX_REVIEW_AGE_DAYS = 400

# Not tuned yet: the reviews clue hasn't had a full run.
REVIEW_CONFIDENCE = 0.7


def guess_from_reviews(data, business, holiday):
    for review in recent_reviews(data, business):
        text = review["content"]
        if not text or not is_about_hours(text) or find_holiday(text) != holiday:
            continue

        if what_customer_found(text) == "closed":
            return {
                "hours": "closed",
                "confidence": REVIEW_CONFIDENCE,
                "reason": "A customer found your doors closed on this day last year",
            }

    return None


def recent_reviews(data, business):
    oldest_allowed = date.fromisoformat(data["snapshot"]) - timedelta(days=MAX_REVIEW_AGE_DAYS)

    recent = []
    for review in data["reviews"][business["meta"]["id"]]:
        if review["written_on"] >= oldest_allowed:
            recent.append(review)
    return recent
