"""Clue: reviews where customers say they found the business closed or open at the wrong time."""

from datetime import date, timedelta

from holiday_names import find_holiday
from review_reading import is_about_hours, what_customer_found

# Reviews older than this are ignored: they describe how the business ran too long ago.
# 400 days covers last year's whole season, including Easter, which moves from year to year.
MAX_REVIEW_AGE_DAYS = 400

# Placeholder until tested: how much to trust one customer saying the doors were closed.
REVIEW_CONFIDENCE = 0.7


def guess_from_reviews(data, business, holiday):
    """Suggest "closed" if a recent review says the customer found the doors closed on this holiday.

    Only "closed" for now: when a customer says it closed early, the review rarely says at what time.
    """
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
    """Return the business's reviews written in the MAX_REVIEW_AGE_DAYS before the snapshot date."""
    snapshot = date.fromisoformat(data["snapshot"])
    oldest_allowed = snapshot - timedelta(days=MAX_REVIEW_AGE_DAYS)

    recent = []
    for review in data["reviews"][business["meta"]["id"]]:
        written = date.fromtimestamp(review["publisherDate"] / 1000)
        if oldest_allowed <= written < snapshot:
            recent.append(review)
    return recent
