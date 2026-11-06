MIN_SHARE_CLOSED = 0.2


def guess_from_peers(data, business, holiday):
    """Guesses "closed" when enough similar businesses (same country, city size, type) close on this holiday."""
    country = business["meta"]["countryCode"]
    city_size = data["city_sizes"].get(business["address"]["city"])
    business_type = business["c_segment"]

    peers = data["peers"].get((country, city_size, business_type, holiday))
    if not peers:
        return None

    share_closed = float(peers["share_entered_closed"] or 0)
    if share_closed < MIN_SHARE_CLOSED:
        return None

    return {
        "hours": "closed",
        "confidence": share_closed,
        "reason": f"{share_closed:.0%} of similar businesses nearby told us they are closed on this day",
    }
