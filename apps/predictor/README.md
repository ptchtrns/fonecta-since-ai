# Predictor

Decides, for every business and special day from 7 Nov 2026 to 6 Jan 2027, whether to **suggest** new hours, **flag** the business for a human, or **do nothing**. Its output is `predictions_2026.csv`, which the organisers score.

Plain Python, standard library only. Reads the data files directly. It doesn't use the web app's database, because that only holds the 32 demo businesses.

## Run it

From the repo root:

```sh
python3 apps/predictor/run.py                 # 2026 season → predictions_2026.csv + score
python3 apps/predictor/run.py --season 2025   # back-test: pretends today is 6 Nov 2025
```

A change should improve **both** seasons. The organisers score hidden businesses, and real customers have longer histories than this dataset, so rules should make sense in general, not just fit these numbers.

## Files

| File | What it does | Status |
|---|---|---|
| `load.py` | Reads every data file once and groups the rows by business | Done |
| `hours.py` | `shown_on_google(data, business, day)`: what Google showed on the snapshot date. Matches the labels exactly for 2026; 27 of 11,118 rows differ for 2025 (seasonal businesses) | Done |
| `run.py` | Goes through every question, asks the clues, writes predictions, prints the score | Working: last year, then peers |
| `combine.py` | Picks the best guess from the clues, or none | Empty |
| `clues/last_year.py` | Suggests the newest year's hours. Confidence = how much past years agree, recent years count more (`YEAR_WEIGHT_DECAY`). Adjusts for the holiday falling on a different weekday | Done |
| `clues/mall.py` | Shop inside a mall: use the mall's hours | Empty |
| `clues/peers.py` | No history: guesses "closed" when enough similar businesses close | Done |
| `clues/closed_for_good.py` | Reviews or Google edits say the business shut down: flag it | Empty |
| `clues/reviews.py` | Reviews mentioning a specific holiday | Empty |

## Using the data

```python
from load import load_everything

data = load_everything()   # takes about 2 seconds
```

| Key | Look up by | Example |
|---|---|---|
| `businesses` | business ID | `data["businesses"]["FI-D0001"]` |
| `holiday_history` | (business ID, holiday) | `data["holiday_history"][("FI-D0001", "XMAS_EVE")]`: oldest first, last one is newest |
| `regular_hours_history` | business ID | `data["regular_hours_history"]["SE-D0016"]` |
| `peers` | (country, city size, business type, holiday) | `data["peers"][("FI", "capital", "cafe", "XMAS_EVE")]` |
| `city_sizes` | city name | `data["city_sizes"]["Helsinki"]` → `"capital"` |
| `holiday_dates` | (country, holiday) | `data["holiday_dates"][("FI", "EASTER_SUNDAY")]` → dates in every year |
| `google_user_edits` | business ID | `data["google_user_edits"]["FI-00187"]` |
| `reviews` | business ID | `data["reviews"]["FI-00001"]` |

Missing keys return an empty list (no history), except in `businesses`, `peers` and `city_sizes`, where you should use `.get()`.

What's inside:

```python
data = {
    "businesses": {
        "FI-D0001": {
            "meta": {"id": "FI-D0001", "countryCode": "FI", "language": "fi"},
            "name": "Kahvila Aurora",
            "c_segment": "cafe",
            "address": {"city": "Helsinki", ...},
            "c_shoppingCenterEntityId": "FI-M000",     # only if inside a mall
            "closed": False,
            "hours": {
                "monday": {"openIntervals": [{"start": "08:00", "end": "20:00"}]},
                ...
                "sunday": {"isClosed": True},
                "holidayHours": [
                    {"date": "2026-12-24", "isClosed": True},
                    {"date": "2026-12-31", "openIntervals": [{"start": "10:00", "end": "14:00"}]},
                ],
                "reopenDate": "2027-04-01",            # only for seasonal businesses
            },
        },
    },

    "holiday_history": {
        ("FI-D0001", "XMAS_EVE"): [
            {"entity_id": "FI-D0001", "date": "2025-12-24", "day_key": "XMAS_EVE",
             "holidayHours": {"date": "2025-12-24", "openIntervals": [{"start": "10:00", "end": "13:00"}]},
             "entered_at": "2025-12-18T17:14:00", "source": "OWNER_UI"},
        ],
    },

    "regular_hours_history": {
        "SE-D0016": [
            {"entity_id": "SE-D0016", "effective_from": "before-2024", "hours": {"monday": {...}, ...}},
            {"entity_id": "SE-D0016", "effective_from": "2026-03-01", "hours": {...}},
        ],
    },

    "peers": {
        ("FI", "capital", "cafe", "XMAS_EVE"): {
            "closed_share_among_entered": "0.395",
            "median_open_special": "10:00",
            "median_close_special": "13:00",
            ...                                        # all values are strings
        },
    },

    "city_sizes": {"Helsinki": "capital", "Espoo": "large_city", ...},

    "holiday_dates": {
        ("FI", "XMAS_EVE"): ["2024-12-24", "2025-12-24", "2026-12-24", "2027-12-24"],
    },

    "google_user_edits": {
        "FI-00187": [
            {"fieldName": "closed", "suggestedContent": "true", "status": "ACCEPTED",
             "dateCreated": "2026-02-27", ...},
        ],
    },

    "reviews": {
        "FI-00001": [
            {"rating": 2, "content": "Joulupäivänä ovet kiinni...", "publisherDate": 1735257600000, ...},
        ],
    },
}
```

Field meanings: `data/fonecta-connect-suggests-2026/docs/DATA_DICTIONARY.md`.

## How a clue should look

Each clue is one function that returns a guess, or `None` if it has nothing to say:

```python
{"action": "SUGGEST", "hours": "10:00-13:00", "confidence": 0.8,
 "reason": "Last year you were open 10–13 on Christmas Eve"}
```

The `reason` text is reused in the messages sent to owners, so write it for a business owner.

## Scoring

- Right hours +1, within 30 min +0.6, open/closed the wrong way round −1, messaging someone whose hours were already right −0.1 to −0.5.
- **Wrong guesses hurt more than silence.** Only suggest when fairly sure.
- Baseline to beat: **54.5** (copy last year → mall → peers, in `data/fonecta-connect-suggests-2026/examples/baseline.py`).

## Rules

- **Never use `labels/` as input.** Those are the answers, only for checking the score and for training.
- **No future data when back-testing.** When testing the 2025 season, ignore entries with `entered_at` after 6 Nov 2025.
- Keep the dev rows in the final `predictions_2026.csv`.

## Scores so far

| Date | Change | Score 2026 | Score 2025 |
|---|---|---|---|
| 7 Nov | Do nothing everywhere | 0 | — |
| 7 Nov | Last-year clue | 57.85 | — |
| 7 Nov | + peers, "closed" only, when ≥ 20% of all similar businesses entered closed | 64.14 | 59.95 |
| 7 Nov | Last year: confidence from all past years, weekday adjustment | 64.17 | 60.34 |

**Tried and dropped:**
- Skipping last-year guesses with low confidence: lowered the score at every cut-off in both seasons. The newest year is right more often than not, even when years disagree.
- Guessing peers' typical special hours (e.g. "10–13"), and using the closed share *among businesses that entered something*. Both lost points at every threshold (score fell to 42.66), because most businesses with no history keep their normal hours.

## Next steps

1. `clues/closed_for_good.py`: flag shut-down businesses
2. `clues/mall.py` + `combine.py`: first time two clues can disagree, so the confidence starts to matter
3. `clues/reviews.py`: AI reads reviews ("closed on Boxing Day")
4. One `settings.py` for all tunable numbers
