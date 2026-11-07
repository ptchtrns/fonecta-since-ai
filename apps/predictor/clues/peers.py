"""Clue: "closed" when enough similar businesses (same country, city size and type) entered closed.

Never suggests opening hours: peers' typical hours lost points in testing, because most owners keep
their normal hours.
"""

# 0.2 scored best on both seasons. Lower values make too many wrong "closed" guesses.
MIN_SHARE_CLOSED = 0.2

# The peer benchmark's shares that the decider gets to see.
PEER_SHARES = [
    "share_entered_closed",
    "share_no_exception_entered",
    "share_entered_special_hours",
    "closed_share_among_entered",
]


def guess_from_peers(data, business, holiday):
    share_closed = peers_share_closed(data, business, holiday)
    if share_closed is None or share_closed < MIN_SHARE_CLOSED:
        return None

    return {
        "hours": "closed",
        "confidence": share_closed,
        "reason": f"{share_closed:.0%} of similar businesses nearby have told us they close on this day",
    }


def peers_share_closed(data, business, holiday):
    """The share of similar businesses that entered "closed" for this holiday, or None if there are no peers."""
    peers = similar_businesses(data, business, holiday)
    if not peers:
        return None
    return float(peers["share_entered_closed"] or 0)


def similar_businesses(data, business, holiday):
    """What businesses of the same country, city size and type entered for this holiday, or None."""
    city_size = data["city_sizes"].get(business["address"]["city"])
    return data["peers"].get((business["meta"]["countryCode"], city_size, business["c_segment"], holiday))


def peers_evidence(data, business, holiday):
    """Every share the peer benchmark has for this holiday, also below this clue's threshold, for the decider.
    -1 when there are no similar businesses to go on."""
    peers = similar_businesses(data, business, holiday)
    evidence = {}
    for share in PEER_SHARES:
        value = -1.0
        if peers and peers.get(share) is not None:
            value = float(peers[share])
        evidence[f"peers_{share}"] = value
    return evidence
