"""The options for one business on one day, and the numbers the decider judges them by.

Every clue may propose hours. Clues that propose the same hours become one option, so an option can
have several reasons. When the evidence leans towards "closed" although no clue was sure enough to
say so, "closed" is offered as a weak option.

Each option is described by features: which clues back it and how strongly, how it differs from
what Google shows, and the evidence behind the clues. A value of -1 means there was nothing to go on.
"""

from datetime import date

from clues import (
    guess_from_google_edits,
    guess_from_last_year,
    guess_from_mall,
    guess_from_peers,
    guess_from_reviews,
    guess_from_seasonal_break,
    guess_from_snow,
    guess_from_type_habits,
    last_year_evidence,
    mall_evidence,
    owner_evidence,
    peers_evidence,
    type_habits_evidence,
)
from clues.last_year import NORMAL_HOURS, past_answers
from hours import is_one_interval

CLUES = ["mall", "last_year", "reviews", "peers", "type_habits", "edits", "snow", "seasonal"]

HOLIDAYS = ["INTERDAY", "FATHERS_DAY", "BLACK_FRIDAY", "DEC23", "NYE", "EPIPHANY_EVE", "BOXING_DAY", "LUCIA",
            "INDEPENDENCE_DAY", "EPIPHANY", "XMAS_EVE", "EVENT", "NEW_YEARS_DAY", "XMAS_DAY", "SCHOOL_BREAK"]
DAY_TYPES = ["PUBLIC_HOLIDAY", "EVE", "OBSERVANCE", "COMMERCIAL", "BETWEEN_HOLIDAYS"]

# When to offer "closed" although no clue suggested it. These only decide which options the decider
# looks at, not what gets suggested.
WEAK_CLOSED_TYPE_RATE = 0.4
WEAK_CLOSED_PEER_SHARE = 0.1
WEAK_CLOSED_OWNER_SHARE = 0.5

OWNER_CLOSED_REASON = "You were closed on most of the special days you have told us about"

NOTHING = -1.0
# For a change in opening or closing time that can't be measured, because one side is closed or has a break.
NOT_COMPARABLE = -999.0


def options_for(data, business, question, shown, rejected):
    """[{"hours", "guesses", "features"}] for the hours worth considering, or [] when there are none."""
    holiday = question["day_key"]
    guesses = ask_clues(data, business, holiday, question["date"])
    backing = group_by_hours(guesses, rejected)

    evidence = gather_evidence(data, business, holiday)
    evidence["rejected_before"] = float(len(rejected))
    if should_offer_weak_closed(backing, rejected, shown, evidence):
        backing["closed"] = {}

    backing.pop(shown, None)  # Google already shows these hours
    if not backing:
        return []

    confidence_by_hours = {}
    for hours, clues in backing.items():
        confidence_by_hours[hours] = combined_confidence(clues.values())

    newest_own_hours = None
    if guesses["last_year"]:
        newest_own_hours = past_answers(data, business, holiday)[-1][1]

    day = describe_day(data, business, question, shown)

    options = []
    for hours, clues in backing.items():
        features = {}
        features.update(day)
        features.update(evidence)
        features.update(describe_backing(clues))
        features.update(describe_hours(hours, shown))
        features.update(compare_with_other_options(hours, confidence_by_hours))
        # Last year's hours moved to this year's weekday, rather than repeated as entered.
        moved = "last_year" in clues and newest_own_hours not in (hours, NORMAL_HOURS)
        features["own_adjusted"] = float(moved)
        options.append({"hours": hours, "guesses": list(clues.values()), "features": features})
    return options


def ask_clues(data, business, holiday, day):
    return {
        "mall": guess_from_mall(data, business, day),
        "last_year": guess_from_last_year(data, business, holiday, day),
        "reviews": guess_from_reviews(data, business, holiday, day),
        "peers": guess_from_peers(data, business, holiday),
        "type_habits": guess_from_type_habits(data, business, holiday),
        "edits": guess_from_google_edits(data, business, holiday),
        "snow": guess_from_snow(data, business, day),
        "seasonal": guess_from_seasonal_break(data, business, day),
    }


def group_by_hours(guesses, rejected):
    """{hours: {clue: guess}}, leaving out hours the owner has already said no to."""
    backing = {}
    for clue, guess in guesses.items():
        if guess is None or guess["hours"] in rejected:
            continue
        backing.setdefault(guess["hours"], {})[clue] = guess
    return backing


def gather_evidence(data, business, holiday):
    evidence = {}
    evidence.update(type_habits_evidence(data, business, holiday))
    evidence.update(peers_evidence(data, business, holiday))
    evidence.update(mall_evidence(data, business))
    evidence.update(last_year_evidence(data, business, holiday))
    evidence.update(owner_evidence(data, business))
    return evidence


def should_offer_weak_closed(backing, rejected, shown, evidence):
    if "closed" in backing or "closed" in rejected or shown == "closed":
        return False
    return (
        evidence["type_closed_rate"] >= WEAK_CLOSED_TYPE_RATE
        or evidence["peers_share_entered_closed"] >= WEAK_CLOSED_PEER_SHARE
        or evidence["owner_closed_share"] >= WEAK_CLOSED_OWNER_SHARE
    )


def weak_closed_reason(features):
    """A reason for the owner when "closed" was chosen from the evidence alone."""
    if features["owner_closed_share"] >= WEAK_CLOSED_OWNER_SHARE:
        return OWNER_CLOSED_REASON
    if features["type_closed_rate"] >= WEAK_CLOSED_TYPE_RATE:
        return f"{features['type_closed_rate']:.0%} of businesses like yours were closed on this day in earlier years"
    return f"{features['peers_share_entered_closed']:.0%} of similar businesses nearby have told us they close on this day"


def combined_confidence(agreeing_guesses):
    """How sure clues that agree are together: two clues at 0.7 give 1 - 0.3 * 0.3 = 0.91."""
    chance_all_wrong = 1.0
    for guess in agreeing_guesses:
        chance_all_wrong *= 1 - guess["confidence"]
    return 1 - chance_all_wrong


def describe_day(data, business, question, shown):
    """What kind of day it is and what Google shows. The same for every option of the day."""
    holiday = question["day_key"]
    features = {}
    for name in HOLIDAYS:
        features[f"holiday_{name}"] = float(holiday == name)
    for kind in DAY_TYPES:
        features[f"day_{kind}"] = float(data["day_types"].get(holiday) == kind)

    country = business["meta"]["countryCode"]
    features["country_FI"] = float(country == "FI")
    features["country_SE"] = float(country == "SE")
    features["weekday"] = float(date.fromisoformat(question["date"]).weekday())

    features["shown_closed"] = float(shown == "closed")
    features["shown_opens"] = NOTHING
    features["shown_closes"] = NOTHING
    features["shown_length"] = NOTHING
    shown_span = span(shown)
    if shown_span:
        opens, closes = shown_span
        features["shown_opens"] = opens
        features["shown_closes"] = closes
        features["shown_length"] = closes - opens
    return features


def describe_backing(clues):
    """Which clues back the option, and how sure each one is."""
    features = {}
    for clue in CLUES:
        features[f"has_{clue}"] = float(clue in clues)
        features[f"conf_{clue}"] = clues[clue]["confidence"] if clue in clues else 0.0
    features["backing_clues"] = float(len(clues))
    features["weak_only"] = float(not clues)
    return features


def describe_hours(hours, shown):
    """How the option differs from what Google shows. Times are minutes after midnight."""
    features = {
        "is_closed": float(hours == "closed"),
        "opens": NOTHING,
        "closes": NOTHING,
        "same_opening": 0.0,
        "same_closing": 0.0,
        "opening_change": NOT_COMPARABLE,
        "closing_change": NOT_COMPARABLE,
        "length_ratio": NOTHING,
    }
    option_span = span(hours)
    shown_span = span(shown)
    if option_span:
        features["opens"], features["closes"] = option_span
    if option_span and shown_span:
        opens, closes = option_span
        shown_opens, shown_closes = shown_span
        features["same_opening"] = float(opens == shown_opens)
        features["same_closing"] = float(closes == shown_closes)
        features["opening_change"] = opens - shown_opens
        features["closing_change"] = closes - shown_closes
        if shown_closes > shown_opens:
            features["length_ratio"] = (closes - opens) / (shown_closes - shown_opens)
    return features


def compare_with_other_options(hours, confidence_by_hours):
    """How this option's clues compare with the other options' clues."""
    others = [confidence for other, confidence in confidence_by_hours.items() if other != hours]
    return {
        "combined": confidence_by_hours[hours],
        "best_other": max(others, default=0.0),
        "options": float(len(confidence_by_hours)),
        "is_top": float(confidence_by_hours[hours] >= max(confidence_by_hours.values())),
    }


def span(hours):
    """(opening, closing) in minutes after midnight for one-interval hours like "10:00-17:00", otherwise None."""
    if not is_one_interval(hours):
        return None
    opens, closes = hours.split("-")
    return minutes(opens), minutes(closes)


def minutes(time):
    hours, mins = time.split(":")
    return int(hours) * 60 + int(mins)
