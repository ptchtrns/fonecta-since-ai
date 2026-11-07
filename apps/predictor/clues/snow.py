"""Clue: ski rentals are closed when there isn't enough snow.

On past days, the dev ski rentals were always closed with under 10 cm of snow. For the next 10 days
the forecast says how much snow there will be; further ahead only the long-term chance of 10 cm of
snow for that place and date is known.

The clue only ever says "closed". Snow doesn't tell a rental's hours, and early in the winter the
long-term chance says snow while the rentals haven't opened their season yet, so guessing "open as
usual" made things worse.
"""

from datetime import date

SNOW_NEEDED_CM = 10

# The forecast in the data is described as noisy, so it never makes us fully sure.
FORECAST_TRUST = 0.9

# Suggest "closed" only when the chance of too little snow is at least this.
MIN_CONFIDENCE = 0.8


def guess_from_snow(data, business, day):
    if business["c_segment"] != "ski_rental":
        return None

    chance = chance_of_snow(data, business["address"]["city"], day)
    if chance is None or 1 - chance < MIN_CONFIDENCE:
        return None

    return {
        "hours": "closed",
        "confidence": 1 - chance,
        "reason": "There is unlikely to be enough snow for skiing on this day",
    }


def chance_of_snow(data, city, day):
    """The chance of at least SNOW_NEEDED_CM of snow on this day: from the forecast if there is one,
    otherwise from the long-term normal for that date."""
    forecast_depth = data["snow_depth"].get((city, day))
    if forecast_depth is not None:
        return FORECAST_TRUST if forecast_depth >= SNOW_NEEDED_CM else 1 - FORECAST_TRUST

    month_and_day = date.fromisoformat(day)
    return data["snow_chance"].get((city, month_and_day.month, month_and_day.day))
