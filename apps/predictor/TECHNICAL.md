# Predictor: how it works

A guide for developers. For running it and the results, see [README.md](README.md).

## The pipeline

`run.py` answers one question at a time: one business on one special day. For each it calls `decide()`, which goes through these steps.

1. `first_checks()` handles the cases where nothing needs weighing:
   - The business seems to have shut down for good: return a FLAG (`clues/closed_for_good.py`), unless the owner has already said it's still open.
   - The owner has already answered a suggestion for this day, or has entered hours for it (Google shows something other than their normal hours): stay quiet. The owner has the last word.
2. `options_for()` in `options.py` asks every clue for a guess and turns the guesses into options. Clues that propose the same hours become one option, so one option can have several reasons. Hours the owner has rejected for this holiday are left out, and so are the hours Google already shows. If the evidence leans towards "closed" but no clue said so, "closed" is added as a weak option.
3. Each option gets a set of numbers, its features, that describe it. See below.
4. `choose()` in `decider.py` predicts how many points suggesting each option would earn, and returns the best one if the prediction is above zero. Otherwise the predictor stays quiet.
5. `decide()` returns the suggestion with the reasons of every clue behind it. When the weak "closed" option wins, `weak_closed_reason()` writes a reason from the evidence instead.

The result is written to `predictions_2026.csv` and, with `--save`, to the web app's `prediction` table (`save.py`).

## Clues

A clue is a function that returns a guess or `None`:

```python
{"hours": "10:00-13:00", "confidence": 0.8, "reason": "Based on what you entered for this day in previous years"}
```

The `reason` is shown to the owner, so it is written for a business owner. The web app translates it with `translateReason()` in `apps/web/src/lib/messages.ts`, so a new reason needs a line there too.

Some clues also have an evidence function. It reports the numbers behind the clue even when the clue stays silent, for example the type's closed rate when it's only 45% and too low for a guess. The decider uses these numbers to judge the guesses. A value of -1 means there was nothing to go on.

| File | Guess | Evidence for the decider |
|---|---|---|
| `clues/last_year.py` | The newest year's hours for this holiday, moved to this year's weekday when they followed the normal opening or closing time | Years of history, entries, years since the newest one, how much the years agree |
| `clues/mall.py` | The shopping centre's published hours for the day | Past special days the shop used its centre's hours, and days it didn't |
| `clues/reviews.py` | What a customer found on this holiday last time, read from the newest review about it by a language model | - |
| `clues/peers.py` | Closed, when at least 20% of similar businesses entered closed | Every share in the peer benchmark |
| `clues/type_habits.py` | Closed, for owners with no history for the holiday, when at least 80% of the type really closed | The type's closed rate and how many days it rests on |
| `clues/google_edits.py` | Hours a Google user suggested for this holiday last time | - |
| `clues/snow.py` | Closed, for ski rentals when there won't be enough snow | - |
| `clues/seasonal_break.py` | Closed, during the business's or its type's yearly break | - |
| `clues/owner.py` | Never guesses | How active the owner is: entries, entries in the last year, days since the latest one, how often they entered closed, Google edits, reviews |
| `clues/closed_for_good.py` | A FLAG, not a guess: a recent review or Google user says the business has shut down | - |

## Features

`options.py` describes each option with 79 numbers, in five groups:

- The day: which holiday and what kind of day, country, weekday, and what Google shows (`describe_day`).
- The evidence from the clues and the owner (`gather_evidence`), plus how many times the owner has rejected a suggestion for this holiday.
- Which clues back the option and how sure each one is (`describe_backing`).
- How the option differs from what Google shows: closed or open, opening and closing times, the change in each, the change in length (`describe_hours`).
- How it compares with the day's other options: the clues' combined confidence, the best other option's, and whether it is the top one (`compare_with_other_options`).

The feature names are saved with the model. Renaming or adding a feature means training again.

## The decider

`decider.py` reads `models/decider_<season>.json`: gradient-boosted decision trees, three models averaged, 300 trees each. For an option the model predicts the points it would earn: +1 for the right hours, -1 for the wrong open/closed state, -0.5 for messaging an owner whose hours were already right, and so on. The best option is suggested if its prediction is above `MIN_EXPECTED_POINTS` (zero).

The confidence written to the predictions file comes from the same number. An option that is right with chance p and wrong otherwise earns 2p - 1 on average, so the confidence is (points + 1) / 2.

When a run starts, `make_predict_function()` writes the trees out as one Python function of nested if statements and compiles it. That evaluates them about four times as fast as following the trees in a loop, which halves a run.

## Training

`train.py` makes the models. It needs scikit-learn and numpy, which `uv run` installs.

For every training window it loads the data as it was on that window's snapshot date, runs the same `first_checks()` and `options_for()` as `run.py`, and scores every option the way the organisers' scorer would have. Those (features, points) rows are what the model learns from.

| Window | Snapshot | Outcome from | Used for |
|---|---|---|---|
| Winter 2024 | 6 Nov 2024 | `dev_truth_history` | 2026 and 2025 |
| Winter 2025 | 6 Nov 2025 | `dev_truth_history` | 2026 |
| Springs 2024, 2025 | 15 Mar 2024, 1 Apr 2025 | `dev_truth_history` | 2026 and 2025 |
| Spring 2026 | 20 Mar 2026 | `dev_truth_history` | 2026 |
| 2025 pilot | 6 Nov 2025 | Owners' answers, businesses outside dev only | 2026 |

The back-test's model only learns from what was known on 6 Nov 2025: the pilot was answered in December 2025, so it isn't used there. In the pilot rows, an accepted or edited answer gives the true hours. A declined one only says the suggestion was wrong, so only the declined hours are scored, as if Google's hours had been right.

`--check` measures what the hidden test businesses will see. It splits the dev businesses into five groups by ID, and decides each group with a model trained without that group's rows. The pilot rows are never held out, as they come from other businesses.

The settings in `PARAMS` were chosen with `--check` on both seasons.

## Adding a clue

1. Write the guess function in `clues/` and export it in `clues/__init__.py`.
2. Add it to `ask_clues()` and `CLUES` in `options.py`.
3. If it has evidence worth knowing even when it stays silent, write an evidence function and add it to `gather_evidence()`.
4. Add the translation of its reason to `apps/web/src/lib/messages.ts`.
5. Train again with `uv run apps/predictor/train.py --check`, and compare both seasons with the scores before.

## The data

`load.py` reads the web app's local database once and drops everything entered, published or written on or after the snapshot date, so no clue can look into the future. A new data source should be filtered there too.

```python
from load import load_everything

data = load_everything("2026-11-06")   # the date the run pretends is today; takes a few seconds
```

| Key | Look up by | Example |
|---|---|---|
| `snapshot` | - | `"2026-11-06"`. Everything below only holds what was known before this date |
| `businesses` | business ID | `data["businesses"]["FI-D0001"]` |
| `holiday_history` | (business ID, holiday) | `data["holiday_history"][("FI-D0001", "XMAS_EVE")]`, in the order entered |
| `holiday_history_by_date` | (business ID, date) | `data["holiday_history_by_date"][("FI-D0001", "2025-12-24")]` |
| `holiday_history_by_business` | business ID | All of the business's entries |
| `regular_hours_history` | business ID | `data["regular_hours_history"]["SE-D0016"]`, oldest first |
| `peers` | (country, city size, business type, holiday) | `data["peers"][("FI", "capital", "cafe", "XMAS_EVE")]` |
| `last_owner_entry` | business ID | The day the owner last entered any special hours |
| `seasonal_types` | - | Business types whose businesses publish seasonal breaks, e.g. `{"seasonal_terrace", "ski_rental"}` |
| `true_closures` | (country, business type, holiday) | `data["true_closures"][("FI", "hair_salon", "INTERDAY")]` gives `{business_id: [days, closed_days]}` |
| `true_closures_by_month` | (business type, month) | The same, by month instead of holiday |
| `holiday_on` | (country, date) | `data["holiday_on"][("FI", "2025-12-26")]` gives `"BOXING_DAY"` |
| `day_types` | holiday | `data["day_types"]["XMAS_EVE"]` gives `"EVE"` |
| `snow_depth` | (city, date) | Measured before the snapshot, or forecast for the 10 days after it |
| `snow_chance` | (city, month, day) | Long-term chance of at least 10 cm of snow |
| `city_sizes` | city name | `data["city_sizes"]["Helsinki"]` gives `"capital"` |
| `google_user_edits` | business ID | `data["google_user_edits"]["FI-00187"]`. Their status may have been decided after the snapshot |
| `reviews` | business ID | `data["reviews"]["FI-00001"]`. Each review has a `written_on` date |
| `owner_answers` | - | `"answered"`: a set of (business ID, date, or "closed-for-good"); `"rejected"`: the hours rejected per (business ID, holiday) |

The lists by business ID or (business ID, holiday) return an empty list for a business with no history. For the other lookups, use `.get()`.

What a business and its history look like:

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
}
```

Field meanings are in `data/fonecta-connect-suggests-2026/docs/DATA_DICTIONARY.md`, and the tables in `apps/web/src/db/schema.ts`.

## Other files

| File | What it does |
|---|---|
| `hours.py` | Hours as text ("10:00-14:00", "closed"), normal weekly hours on a date, published breaks, and what Google shows: from `entities.json` for 2026, rebuilt from the history for the 2025 back-test (27 of 11,118 rows differ) |
| `save.py` | Writes the predictions and their reasons to the web app's `prediction` table through Wrangler |
| `ai.py` | Asks a language model on Featherless, or locally through Ollama, and caches every answer in `ai_cache.json`. Retries while Featherless is busy, and stops a run after 2 million tokens |
| `review_reading.py` | Asks the model what a review says: closed, closed early, opened late, open, shut down for good, or nothing useful, and the times it mentions. Finnish reviews go to Qwen2.5-72B, Swedish and Norwegian ones to Mistral-Small 24B |
| `read_reviews.py` | Reads the reviews the clues need in batches, and cleans the cache |
| `holiday_names.py` | Holiday names as customers write them in fi/sv/nb/en, to tell which holiday a review is about |
