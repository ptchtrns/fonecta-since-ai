"""Clue: what customers found on this holiday last year, according to their reviews.

A review says the business was closed, closed early, opened late, or was open although Google said
closed, and sometimes at what time. The newest review about the holiday decides.
"""

from datetime import date, timedelta

from holiday_names import find_holiday
from hours import is_one_interval, normal_hours
from review_reading import is_about_hours, read_review

# Older reviews describe how the business ran too long ago. 400 days covers last year's whole
# season, including Easter, which moves around.
MAX_REVIEW_AGE_DAYS = 400

# On dev businesses, about 9 in 10 reviews read as "closed" were about days the business really was
# closed. The rest are customers who were wrong; the data has some misleading reviews on purpose.
REVIEW_CONFIDENCE = 0.85


def guess_from_reviews(data, business, holiday, day):
    country = business["meta"]["countryCode"]
    reviews = sorted(recent_reviews(data, business), key=lambda review: review["written_on"], reverse=True)

    for review in reviews:
        text = review["content"]
        if not text or not is_about_hours(text) or find_holiday(text) != holiday:
            continue

        guess = guess_from_reading(data, business, day, read_review(text, country))
        if guess:
            return guess

    return None


def guess_from_reading(data, business, day, reading):
    """Turn one review's reading into a guess for this year's day, or None if it says nothing usable."""
    found = reading["found"]
    if found == "closed":
        return {
            "hours": "closed",
            "confidence": REVIEW_CONFIDENCE,
            "reason": "A customer found your doors closed on this day last year",
        }

    normal = normal_hours(data, business, day)
    if not is_one_interval(normal):
        return None
    opens, closes = normal.split("-")
    if closes <= opens:
        return None  # normally open past midnight; the times can't be compared simply

    if found == "closed_early":
        closing = reading["closed_at"] or on_the_hour_before(reading["arrived_at"])
        if closing and opens < closing < closes:
            return {
                "hours": f"{opens}-{closing}",
                "confidence": REVIEW_CONFIDENCE,
                "reason": f"A customer found you already closed at {closing} on this day last year",
            }

    if found == "opened_late":
        opening = reading["opened_at"]
        if opening and opens < opening < closes:
            return {
                "hours": f"{opening}-{closes}",
                "confidence": REVIEW_CONFIDENCE,
                "reason": f"A customer found you still closed until {opening} on this day last year",
            }

    if found == "open":
        return {
            "hours": normal,
            "confidence": REVIEW_CONFIDENCE,
            "reason": "A customer found you open on this day last year",
        }

    return None


def on_the_hour_before(time):
    """A customer who came at 16:20 and found the doors closed: the business most likely closed at 16:00."""
    if time is None:
        return None
    return time[:3] + "00"


def recent_reviews(data, business):
    oldest_allowed = date.fromisoformat(data["snapshot"]) - timedelta(days=MAX_REVIEW_AGE_DAYS)

    recent = []
    for review in data["reviews"][business["meta"]["id"]]:
        if review["written_on"] >= oldest_allowed:
            recent.append(review)
    return recent
