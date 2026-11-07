# Predictor

Decides, for every business and special day from 7 Nov 2026 to 6 Jan 2027, whether to **suggest** new hours, **flag** the business for a human, or **do nothing**. Its output is `predictions_2026.csv`, which the organisers score.

Plain Python, standard library only. Reads the web app's local database (`apps/web/.wrangler`), loaded with the full dataset. It stops with an error if that database holds only the 32 businesses of the limited set (`pnpm db:seed:limited`), because that set has no training data and would overwrite `predictions_2026.csv` with a tiny file.

## Run it

From the repo root, once per clone and after any reseed (needs Node, pnpm and uv, see `docs/DEVELOPMENT.md`):

```sh
pnpm install && pnpm db:migrate && pnpm db:seed
```

Then:

```sh
python3 apps/predictor/run.py                 # 2026 season → predictions_2026.csv + score
python3 apps/predictor/run.py --season 2025   # back-test: pretends today is 6 Nov 2025
python3 apps/predictor/run.py --save local    # also show the 2026 predictions on the dashboard
python3 apps/predictor/run.py --save remote   # the same for the deployed site, demo businesses only
```

`--save` replaces the `prediction` table, which the dashboard's Home page shows. Run `pnpm db:migrate:remote` in `apps/web` before the first `--save remote`. Reseeding empties the table, so save again afterwards.

The questions and all the data come from the database. `evaluate.py` is the organisers' scorer and still reads the labels from `labels/*.csv`. To read another database file, set `PREDICTOR_DB`.

The reviews are read by language models on [Featherless](https://featherless.ai). Put the key in the `.env` file in the repo root (gitignored):

```
FEATHERLESS_API_KEY=...
```

Every answer is saved in `ai_cache.json`, which is committed, so a run only asks about reviews nobody has read yet. To read new reviews in batches and keep an eye on cost:

```sh
python3 apps/predictor/read_reviews.py 300     # read the next 300 unread reviews
python3 apps/predictor/read_reviews.py clean   # drop cached answers nothing uses any more
```

Reading all 1,350 reviews cost about 10 cents. Setting `PROVIDER = "ollama"` in `ai.py` runs a local model instead, but the small ones that fit a laptop read Finnish badly.

A change should improve **both** seasons. The organisers score hidden businesses, and real customers have longer histories than this dataset, so rules should make sense in general, not just fit these numbers.

## How it decides

For every question (one business on one day):

1. If the business seems to have shut down for good while Google still shows it open, flag it for a person to check (`clues/closed_for_good.py`) and stop there.
2. Ask every clue for a guess. A clue answers with hours, a confidence and a reason, or with nothing.
3. `combine.py` adds up the clues: clues that suggest the same hours back each other up, and the hours with the highest combined confidence win.
4. Work out what Google shows for that day (`hours.py`).
5. If the winning hours differ from what Google shows, suggest them. Otherwise do nothing.

## Files

| File | What it does | Status |
|---|---|---|
| `run.py` | Goes through every question, asks the clues, writes predictions, prints the score | Working |
| `load.py` | Reads the database once, groups the rows by business and drops everything from on or after the snapshot date, so no clue can look into the future | Done |
| `save.py` | Puts the predictions with their reasons in the `prediction` table for the dashboard, through Wrangler | Done |
| `hours.py` | What Google shows: `shown_on_google_now` (2026, from entities.json, matches the labels exactly) and `shown_on_google_back_then` (2025 back-test, rebuilt from history, 27 of 11,118 rows differ). Also `normal_hours` and `published_breaks` | Done |
| `combine.py` | Combines the clues: agreeing clues raise the confidence, `1 - (1 - c1) × (1 - c2) × …`, so two clues at 0.7 give 0.91 | Done |
| `ai.py` | Asks a language model on Featherless (or a local one through Ollama) and returns its JSON answer. Every answer is cached in `ai_cache.json`. Waits and tries again while Featherless is busy, and stops a run after 2 million tokens | Done |
| `holiday_names.py` | Holiday names as customers write them, in fi/sv/nb/en. `find_holiday(text)` was right for 99.9% of reviews, checked against the review dates | Done |
| `review_reading.py` | Asks the model what a review says (closed, closed early, opened late, open, shut down for good, or nothing useful) and, for closed early or opened late, which times it gives. Finnish businesses' reviews go to Qwen2.5-72B, Swedish and Norwegian ones to Mistral-Small 24B | Done |
| `read_reviews.py` | Reads the reviews the clues need, in batches, and cleans the cache | Done |
| `clues/closed_for_good.py` | Flags a business when a recent review says it shut down for good, or a Google user reported it closed, and the owner hasn't entered anything since. Skipped when Google already shows it closed | Done |
| `clues/google_edits.py` | A Google user suggested hours for this holiday the last time it came round: suggest those, with less confidence than the owner's own entries. Such edits matched what really happened about 9 times out of 10, but owners don't always repeat themselves | Done |
| `clues/last_year.py` | Suggests the newest year's hours. Confidence = how much past years agree, recent years count more (`YEAR_WEIGHT_DECAY`), and lower for every year the owner has skipped since (`SKIPPED_YEAR_DECAY`). Adjusts for the holiday falling on a different weekday | Done |
| `clues/mall.py` | Shop in a shopping centre that published hours for the day: suggest the centre's exact hours (shops did this ~250 times vs 6 times keeping their own opening time). More confident when the shop's own past entries show it follows its centre, much less when they show it keeps its own hours | Done |
| `clues/peers.py` | Suggests closed when at least 20% of similar businesses entered closed | Done |
| `clues/reviews.py` | What a customer found on this holiday last year, from the newest review about it: closed → closed; closed early at a time → normal opening to that time ("came at 16.20, already closed" → 16:00); opened late at a time → that time to normal closing; open although Google said closed → normal hours | Done |
| `clues/seasonal_break.py` | Businesses that close for the same part of every year (summer terraces in winter, ski rentals in summer): suggest closed when the business was on its published break on the same date in earlier years. A business that never published a break gets its type's season instead, but only for types whose businesses do publish breaks | Done |
| `clues/snow.py` | Ski rentals: suggest closed when the forecast (next 10 days) or the long-term normal says there won't be 10 cm of snow. Never suggests "open": snow doesn't tell the hours, and early in the winter the normal says snow before the season has started | Done |
| `clues/type_habits.py` | Owner never entered anything for this holiday: suggest closed when at least 80% of the same type and country really closed, learned from the training data | Done |

## Using the data

```python
from load import load_everything

data = load_everything("2026-11-06")   # the date the run pretends is today; takes a few seconds
```

| Key | Look up by | Example |
|---|---|---|
| `snapshot` | — | `"2026-11-06"`. Everything below only holds what was known before this date |
| `businesses` | business ID | `data["businesses"]["FI-D0001"]` |
| `holiday_history` | (business ID, holiday) | `data["holiday_history"][("FI-D0001", "XMAS_EVE")]`, in the order entered |
| `holiday_history_by_date` | (business ID, date) | `data["holiday_history_by_date"][("FI-D0001", "2025-12-24")]` |
| `holiday_history_by_business` | business ID | All of the business's entries |
| `regular_hours_history` | business ID | `data["regular_hours_history"]["SE-D0016"]`, oldest first |
| `peers` | (country, city size, business type, holiday) | `data["peers"][("FI", "capital", "cafe", "XMAS_EVE")]` |
| `last_owner_entry` | business ID | The day the owner last entered any special hours |
| `seasonal_types` | — | Business types whose businesses publish seasonal breaks, e.g. `{"seasonal_terrace", "ski_rental"}` |
| `true_closures` | (country, business type, holiday) | `data["true_closures"][("FI", "hair_salon", "INTERDAY")]` → `{business_id: [days, closed_days]}` |
| `true_closures_by_month` | (business type, month) | The same, by month instead of holiday |
| `holiday_on` | (country, date) | `data["holiday_on"][("FI", "2025-12-26")]` → `"BOXING_DAY"` |
| `snow_depth` | (city, date) | Measured before the snapshot, or forecast for the 10 days after it |
| `snow_chance` | (city, month, day) | Long-term chance of at least 10 cm of snow |
| `city_sizes` | city name | `data["city_sizes"]["Helsinki"]` → `"capital"` |
| `google_user_edits` | business ID | `data["google_user_edits"]["FI-00187"]`. Their status may have been decided after the snapshot |
| `reviews` | business ID | `data["reviews"]["FI-00001"]`. Each review has a `written_on` date |

The lists by business ID or (business ID, holiday) return an empty list for a business with no history. For the other lookups, use `.get()`.

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
            "share_entered_closed": 0.168,
            "median_open_special": "10:00",
            "median_close_special": "13:00",
            ...
        },
    },

    "true_closures": {
        ("FI", "hair_salon", "INTERDAY"): {"FI-00040": [6, 6], "FI-00097": [6, 6], ...},   # [days, closed days]
    },

    "city_sizes": {"Helsinki": "capital", "Espoo": "large_city", ...},

    "google_user_edits": {
        "FI-00187": [
            {"fieldName": "closed", "suggestedContent": "true", "status": "ACCEPTED",
             "dateCreated": "2026-02-27", ...},
        ],
    },

    "reviews": {
        "FI-00001": [
            {"rating": 2, "content": "Joulupäivänä ovet kiinni...", "written_on": date(2024, 12, 27)},
        ],
    },
}
```

Field meanings: `data/fonecta-connect-suggests-2026/docs/DATA_DICTIONARY.md`. The tables are in `apps/web/src/db/schema.ts`.

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

- **`labels/` holds the answers.** Use them only to check the score and as training data. The scorer's answers aren't in the database: `run.py` passes `evaluate.py` the `labels/dev_labels_*.csv` files. `dev_truth_history` is the only answer table there, given for training: `type_habits` and `seasonal_break` learn from it how often each business *type* closes, using only days before the snapshot and leaving the business itself out, so a dev business's own answers never decide its guess.
- **No future data.** `load.py` already drops anything entered, published or written on or after the snapshot date. A new data source should be filtered there too.
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
| 7 Nov | + closed-for-good flag (catches 1 of the 2 dev businesses; the other has no review or edit to go on) | 65.22 | 61.80 |
| 7 Nov | + Google edits, snow, seasonal breaks, less trust in skipped years, shops that follow their centre, and the reviews clue with every review read | **66.27** | **63.35** |

The rows before the last are without the reviews clue. A run takes about 10 seconds once the reviews are in `ai_cache.json`.

**Tried and dropped:**
- Skipping last-year guesses with low confidence: lowered the score at every cut-off in both seasons. The newest year is right more often than not, even when years disagree.
- Guessing peers' typical special hours (e.g. "10–13"), and using the closed share *among businesses that entered something*. Both lost points at every threshold (score fell to 42.66), because most businesses with no history keep their normal hours.
- Applying peers' typical *change* to the business's own hours (e.g. "cafés close 5 h early on Christmas Eve"), learned from other businesses' past entries. Best result 62.63 (2026) and 59.56 (2025), both below the current code. Of 255 such suggestions on 2026 dev businesses, 212 went to owners who had kept their normal hours.
- Type habits for every business, also those with their own history: lowered the score at every cut-off, because the type's habit overruled the owner's own entries.
- Type habits below 80%: at 50–70% the wrong "closed" guesses cost more than the right ones earned. Measuring the rate only on days Google showed the business open didn't help either.
- A small local model (`qwen3:1.7b`) without help read Finnish "ovet olivat kiinni" (the doors were closed) as *open* every time. A word table in the instructions fixed it.
- Setting each clue's confidence to how often it was right in the other season: about −1 in both seasons. Peers is right 77–100% of the time on average, but mostly on days everyone closes anyway. When it disagrees with the owner's own history, the owner is usually right.
- Guessing from the owner's habit on other holidays: owners who were closed on every other public holiday they entered were only closed about half the time on the ones they skipped. Together with a type rate of 0.5–0.8 it only breaks even.
- Customer activity in `analytics_daily.parquet`: on days a business was really closed while Google showed it open, customer actions dropped to about 0.6× their usual level. But one year's drop predicts this year's closing at most about 40% of the time, so on its own it can't justify a "closed" suggestion.
- "Snow, so open as usual" for ski rentals: snow doesn't tell the hours, and in late November the long-term normal says snow while the rentals haven't started their season. Only "no snow, so closed" is kept.
- Snow for summer terraces: all their winter days were closed, with or without snow. The season decides, which `seasonal_break` covers.
- Moving Google edits' hours to this year's weekday, the way `last_year` does: no effect in either season.

## Where the points are lost

2026 season, dev businesses, measured at a score of 65.0 (before the flag, edits, snow and seasonal clues, and without reviews). 5,398 points are available; we got 3,509.

| What happens | Points lost |
|---|---|
| Owner never entered this day, the real hours were different (e.g. NYE closing early) | 584 |
| Owner never entered this day, it was really closed | 481 |
| We suggested open when it was closed, or the other way round | 376 |
| We messaged an owner whose hours were already right | 262 |
| Our hours were close but not exact | 104 |
| Closed for good, not flagged | 21 |

The 2025 back-test looks the same. The biggest lesson so far: owners who skip a holiday mostly keep their normal hours. For the same type of business, the share that closes is much lower among owners who never told us anything than among everyone. So guesses for owners without history have to be careful.

How high could it go? If we knew exactly what every business really did on the same holiday last time and simply repeated it, the score would be 81.9 in 2026 and 71.8 in 2025. Owners change their habits, so even perfect memory stops there. The gap between that and our score is mostly owners who never tell us anything, and every source we have about them is weak.

## Ideas to improve accuracy

Each idea starts from why it should work for real businesses, not from the dev scores. The dev answers were only used to check whether a data source can be trusted.

1. **Owners who changed their normal hours and never updated the listing.** Customers notice and suggest new weekly hours. Where the listing really is outdated, those edits showed the real hours 31 times out of 45, and 17 of the 22 dev businesses with outdated hours have one. But on listings that are up to date, the edits are almost always wrong (1 right out of 478). So only act when there's a second sign: a review like "Aukioloajat ovat muuttuneet, netissä on vanhat tiedot" (89 reviews say this), or several edits agreeing. One fix covers every day the owner keeps normal hours, and it's a useful suggestion for the product on its own.
2. **Don't repeat what the owner rejected** in the 2025 pilot. Only 7 dev rows, but it's how a real service should behave.
3. **The days between Christmas and New Year.** The last-year clue uses the newest of those days for all of them. Matching by weekday, or by which of the days it is, should fit owners who close for part of the week.
4. **Events and school holidays.** Few rows, but two demo stories need them: the bar next to the arena (FI-D0010) and the play centre in school holidays (FI-D0014).

## AI ideas we haven't built yet

1. **Reviews that don't name the holiday.** "Came here on the holiday but it was closed" could be matched to the nearest holiday by the date the review was written.
2. **An AI judge for disagreements.** When clues disagree (about 300 dev rows per season), give a model all the evidence: the owner's past entries, the centre's hours, reviews, edits, what similar businesses do. Ask for the hours, how sure it is and a reason for the owner. Even a perfect judge there would add at most +1.2 to +1.7 points, so the main value is the explanation for the owner. Replacing `combine` everywhere isn't worth it: a perfect judge on every row would reach about 75 in 2026, but only by knowing when an owner changed their habit, which isn't in the clues, and it would mean about 20,000 questions per season.
3. **Spotting outdated normal hours.** Per business, give the model its reviews, its weekly-hours edits and its current listing, and ask: have the normal hours changed, and to what?
4. **A learned decider instead of "highest confidence wins".** Built and tested, not switched on yet. For every day it lists the options (each clue's hours, a weaker "closed", Sunday hours on a public holiday, Saturday hours on an eve), and a model predicts how many points each would earn from what it learned in earlier seasons: the dev businesses' true hours, and the owners' answers to the 2025 pilot. It suggests the best option only when that's clearly above zero, and otherwise stays silent. It learns only from seasons that ended before the snapshot, as the challenge's back-test rule requires: +1.4 in 2026 (learning from the 2024 and 2025 seasons and the pilot answers) and +1.8 in the 2025 back-test (learning only from the 2024 season). In the product, every new approve, edit or decline from an owner would become another example. Not switched on because it needs scikit-learn, pandas and pyarrow, and a run takes several minutes longer while it replays the earlier seasons.
5. **An owner profile.** A model reads an owner's whole history and describes their habits ("closes on public holidays, short hours on eves, follows the centre"), then predicts the days they skipped. The simple rule version only broke even (see above), so this needs a careful test.
6. **Which events matter.** A model reads the event names and keywords in `local_events.json` and decides which nearby businesses get a busy evening: the bar next to the arena, not the dentist.
7. **Writing the owner messages.** Turn the clues' reasons into a short message in the owner's language (fi/sv/nb), and understand free-text replies like "we close at 3 instead".

## Next steps

1. Switch on the learned decider (AI idea 4) once runs are faster: predict all options of a day at once instead of one by one.
2. Export the review readings with business IDs (`review_readings.csv`), so the website and the owner messages can quote them.
3. The AI judge for when clues disagree (AI idea 2).
