"""Clue: "closed" when enough similar businesses (same country, city size and type) entered closed.

Never suggests opening hours: peers' typical hours lost points in testing, because most owners keep
their normal hours.
"""

# 0.2 scored best on both seasons. Lower values make too many wrong "closed" guesses.
MIN_SHARE_CLOSED = 0.2


def guess_from_peers(data, business, holiday):
    city_size = data["city_sizes"].get(business["address"]["city"])
    peers = data["peers"].get((business["meta"]["countryCode"], city_size, business["c_segment"], holiday))
    if not peers:
        return None

    share_closed = float(peers["share_entered_closed"] or 0)
    if share_closed < MIN_SHARE_CLOSED:
        return None

    return {
        "hours": "closed",
        "confidence": share_closed,
        "reason": f"{share_closed:.0%} of similar businesses nearby have told us they close on this day",
    }
