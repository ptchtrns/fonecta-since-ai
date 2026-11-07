# Predictor

Decides, for every business and special day from 7 Nov 2026 to 6 Jan 2027, whether to **suggest** new hours, **flag** the business for a human, or **do nothing**. Its output is `predictions_2026.csv`, which the organisers score.

Plain Python, standard library only. Reads the data files directly. It doesn't use the web app's database, because that only holds the 32 demo businesses.

## Run it

From the repo root:

```sh
python3 apps/predictor/run.py                 # 2026 season → predictions_2026.csv + score
python3 apps/predictor/run.py --season 2025   # back-test: pretends today is 6 Nov 2025
```

The reviews clue asks a local language model, so [Ollama](https://ollama.com) has to be running with the model pulled:

```sh
ollama pull qwen3:1.7b
ollama serve
```

The first run reads up to ~1,300 reviews per season, about an hour on a laptop. Every answer is saved in `ai_cache.json`, so later runs take seconds.

A change should improve **both** seasons. The organisers score hidden businesses, and real customers have longer histories than this dataset, so rules should make sense in general, not just fit these numbers.

## How it decides

For every question (one business on one day):

1. Work out what Google shows for that day (`hours.py`).
2. Ask every clue for a guess. A clue answers with hours, a confidence and a reason, or with nothing.
3. `combine.py` adds up the clues: clues that suggest the same hours back each other up, and the hours with the highest combined confidence win.
4. If the winning hours differ from what Google shows, suggest them. Otherwise do nothing.

## Files

| File | What it does | Status |
|---|---|---|
| `run.py` | Goes through every question, asks the clues, writes predictions, prints the score | Working |
| `load.py` | Reads every data file once and groups the rows by business | Done |
| `hours.py` | What Google shows: `shown_on_google_now` (2026, from entities.json, matches the labels exactly) and `shown_on_google_back_then` (2025 back-test, rebuilt from history, 27 of 11,118 rows differ). Also `normal_hours` | Done |
| `combine.py` | Combines the clues: agreeing clues raise the confidence, `1 - (1 - c1) × (1 - c2) × …`, so two clues at 0.7 give 0.91 | Done |
| `ai.py` | Asks the local language model (Ollama, `qwen3:1.7b`) and caches every answer in `ai_cache.json` | Done |
| `holiday_names.py` | Holiday names as customers write them, in fi/sv/nb/en. `find_holiday(text)` was right for 99.9% of reviews, checked against the review dates | Done |
| `review_reading.py` | Is a review about opening hours, and what did the customer find (asks the AI, with a small word table that fixed Finnish) | Done |
| `clues/last_year.py` | Suggests the newest year's hours. Confidence = how much past years agree, recent years count more (`YEAR_WEIGHT_DECAY`). Adjusts for the holiday falling on a different weekday | Done |
| `clues/mall.py` | Shop in a shopping centre that published hours for the day: suggest the centre's exact hours (shops did this ~250 times vs 6 times keeping their own opening time) | Done |
| `clues/reviews.py` | A review from the last 400 days says the doors were closed on this holiday: suggest closed | Built, not scored yet |
| `clues/type_habits.py` | Owner never entered anything for this holiday: suggest closed when at least 80% of the same type and country really closed, learned from the training data | Done |
| `clues/peers.py` | Suggests closed when at least 20% of similar businesses entered closed | Done |
| `clues/closed_for_good.py` | Reviews or Google edits say the business shut down: flag it | Empty |

## Using the data

```python
from load import load_everything

data = load_everything("2026-11-06")   # the date the run pretends is today; takes a few seconds
```

| Key | Look up by | Example |
|---|---|---|
| `snapshot` | — | `"2026-11-06"`. Nothing entered after it may be used |
| `businesses` | business ID | `data["businesses"]["FI-D0001"]` |
| `holiday_history` | (business ID, holiday) | `data["holiday_history"][("FI-D0001", "XMAS_EVE")]`, in the order entered |
| `holiday_history_by_date` | (business ID, date) | `data["holiday_history_by_date"][("FI-D0001", "2025-12-24")]` |
| `regular_hours_history` | business ID | `data["regular_hours_history"]["SE-D0016"]`, oldest first |
| `peers` | (country, city size, business type, holiday) | `data["peers"][("FI", "capital", "cafe", "XMAS_EVE")]` |
| `true_closures` | (country, business type, holiday) | `data["true_closures"][("FI", "hair_salon", "INTERDAY")]` → `{business_id: [days, closed_days]}` |
| `city_sizes` | city name | `data["city_sizes"]["Helsinki"]` → `"capital"` |
| `holiday_dates` | (country, holiday) | `data["holiday_dates"][("FI", "EASTER_SUNDAY")]` → dates in every year |
| `google_user_edits` | business ID | `data["google_user_edits"]["FI-00187"]` |
| `reviews` | business ID | `data["reviews"]["FI-00001"]` |

Missing keys return an empty list (no history), except in `businesses`, `peers`, `true_closures` and `city_sizes`, where you should use `.get()`.

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
            "share_entered_closed": "0.168",
            "median_open_special": "10:00",
            "median_close_special": "13:00",
            ...                                        # all values are strings
        },
    },

    "true_closures": {
        ("FI", "hair_salon", "INTERDAY"): {"FI-00040": [6, 6], "FI-00097": [6, 6], ...},   # [days, closed days]
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
{"hours": "10:00-13:00", "confidence": 0.8, "reason": "Based on what you entered for this day in previous years"}
```

Add it to `clues/__init__.py` and to the list passed to `combine` in `run.py`. The `reason` text is reused in the messages sent to owners, so write it for a business owner.

## Scoring

- Right hours +1, within 30 min +0.6, open/closed the wrong way round −1, messaging someone whose hours were already right −0.1 to −0.5.
- **Wrong guesses hurt more than silence.** Only suggest when fairly sure.
- Baseline to beat: **54.5** (copy last year → mall → peers, in `data/fonecta-connect-suggests-2026/examples/baseline.py`).

## Rules

- **`labels/` holds the answers.** Use them only to check the score and as training data. `dev_truth_history.csv` is given for training: `type_habits` learns how often each business *type* closes from it, using only days before the snapshot and leaving the business itself out, so a dev business's own answers never decide its guess.
- **No future data when back-testing.** When testing the 2025 season, ignore anything entered or written after 6 Nov 2025.
- Keep the dev rows in the final `predictions_2026.csv`.

## Scores so far

| Date | Change | Score 2026 | Score 2025 |
|---|---|---|---|
| 7 Nov | Do nothing everywhere | 0 | — |
| 7 Nov | Last-year clue | 57.85 | — |
| 7 Nov | + peers, "closed" only, when ≥ 20% of all similar businesses entered closed | 64.14 | 59.95 |
| 7 Nov | Last year: confidence from all past years, weekday adjustment | 64.17 | 60.34 |
| 7 Nov | + mall clue (centre's exact hours, before last year) | 64.58 | 61.40 |
| 7 Nov | `combine` instead of a fixed clue order | 64.55 | 61.20 |
| 7 Nov | + type habits (no own history, ≥ 80% of the type closed) | 65.00 | 61.80 |

Scores from 7 Nov onwards are without the reviews clue, which hasn't had its first full run yet.

**Tried and dropped:**
- Skipping last-year guesses with low confidence: lowered the score at every cut-off in both seasons. The newest year is right more often than not, even when years disagree.
- Guessing peers' typical special hours (e.g. "10–13"), and using the closed share *among businesses that entered something*. Both lost points at every threshold (score fell to 42.66), because most businesses with no history keep their normal hours.
- Applying peers' typical *change* to the business's own hours (e.g. "cafés close 5 h early on Christmas Eve"), learned from other businesses' past entries. Best result 62.63 (2026) and 59.56 (2025), both below the current code. Of 255 such suggestions on 2026 dev businesses, 212 went to owners who had kept their normal hours.
- Type habits for every business, also those with their own history: lowered the score at every cut-off, because the type's habit overruled the owner's own entries.
- Type habits below 80%: at 50–70% the wrong "closed" guesses cost more than the right ones earned. Measuring the rate only on days Google showed the business open didn't help either.
- A small local model (`qwen3:1.7b`) without help read Finnish "ovet olivat kiinni" (the doors were closed) as *open* every time. A word table in the instructions fixed it.

## Next steps

1. `clues/closed_for_good.py`: flag shut-down businesses
2. First full run with the reviews clue, then tune `REVIEW_CONFIDENCE`
3. Single-year confidence in `last_year`: one year of history currently counts as certain (1.0)
4. More clues: Google user edits, owner rejections from the 2025 pilot, events, school holidays, snow
5. Featherless (cloud AI) for better review reading, and an "AI judge" for unclear cases
