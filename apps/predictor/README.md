# Predictor

Decides, for every business and special day from 7 Nov 2026 to 6 Jan 2027, whether to **suggest** new hours, **flag** the business for a human, or **do nothing**. Its output is `predictions_2026.csv`, which the organisers score.

Plain Python, standard library only. Reads the data files directly. It doesn't use the web app's database, because that only holds the 32 demo businesses.

## Run it

From the repo root:

```sh
python3 apps/predictor/run.py                 # 2026 season → predictions_2026.csv + score
python3 apps/predictor/run.py --season 2025   # back-test: pretends today is 6 Nov 2025
```

The reviews are read by language models on [Featherless](https://featherless.ai). Put the key in the `.env` file in the repo root (gitignored):

```
FEATHERLESS_API_KEY=...
```

Every answer is saved in `ai_cache.json`, which is committed, so a run only asks about reviews nobody has read yet. To read new reviews in batches and keep an eye on cost:

```sh
python3 apps/predictor/read_reviews.py 300     # read the next 300 unread reviews
python3 apps/predictor/read_reviews.py clean   # drop cached answers nothing uses any more
```

Reading all ~1,350 reviews costs about 15 cents. Setting `PROVIDER = "ollama"` in `ai.py` runs a local model instead, but the small ones that fit a laptop read Finnish badly.

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
| `load.py` | Reads every data file once, groups the rows by business and drops everything from on or after the snapshot date, so no clue can look into the future | Done |
| `hours.py` | What Google shows: `shown_on_google_now` (2026, from entities.json, matches the labels exactly) and `shown_on_google_back_then` (2025 back-test, rebuilt from history, 27 of 11,118 rows differ). Also `normal_hours` | Done |
| `combine.py` | Combines the clues: agreeing clues raise the confidence, `1 - (1 - c1) × (1 - c2) × …`, so two clues at 0.7 give 0.91 | Done |
| `ai.py` | Asks a language model on Featherless (or a local one through Ollama) and returns its JSON answer. Every answer is cached in `ai_cache.json`. Waits and tries again while Featherless is busy, and stops a run after 2 million tokens | Done |
| `holiday_names.py` | Holiday names as customers write them, in fi/sv/nb/en. `find_holiday(text)` was right for 99.9% of reviews, checked against the review dates | Done |
| `review_reading.py` | Asks the model what a review says (closed, closed early, opened late, open, shut down for good, or nothing useful) and, for closed early or opened late, which times it gives. Finnish businesses' reviews go to Qwen2.5-72B, Swedish and Norwegian ones to Mistral-Small 24B. `PROMPT_NOTES.md` explains how the instructions were written | Done |
| `read_reviews.py` | Reads the reviews the clues need, in batches, and cleans the cache | Done |
| `clues/last_year.py` | Suggests the newest year's hours. Confidence = how much past years agree, recent years count more (`YEAR_WEIGHT_DECAY`). Adjusts for the holiday falling on a different weekday | Done |
| `clues/mall.py` | Shop in a shopping centre that published hours for the day: suggest the centre's exact hours (shops did this ~250 times vs 6 times keeping their own opening time) | Done |
| `clues/reviews.py` | A review from the last 400 days says the doors were closed on this holiday: suggest closed. Closed-early reviews with a closing time aren't used yet | Built, reviews being read |
| `clues/type_habits.py` | Owner never entered anything for this holiday: suggest closed when at least 80% of the same type and country really closed, learned from the training data | Done |
| `clues/peers.py` | Suggests closed when at least 20% of similar businesses entered closed | Done |
| `clues/closed_for_good.py` | Flags a business when a recent review says it shut down for good, or a Google user reported it closed, and the owner hasn't entered anything since. Skipped when Google already shows it closed | Done |

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
| `regular_hours_history` | business ID | `data["regular_hours_history"]["SE-D0016"]`, oldest first |
| `peers` | (country, city size, business type, holiday) | `data["peers"][("FI", "capital", "cafe", "XMAS_EVE")]` |
| `true_closures` | (country, business type, holiday) | `data["true_closures"][("FI", "hair_salon", "INTERDAY")]` → `{business_id: [days, closed_days]}` |
| `city_sizes` | city name | `data["city_sizes"]["Helsinki"]` → `"capital"` |
| `google_user_edits` | business ID | `data["google_user_edits"]["FI-00187"]`. Their status may have been decided after the snapshot |
| `reviews` | business ID | `data["reviews"]["FI-00001"]`. Each review has a `written_on` date |

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

    "google_user_edits": {
        "FI-00187": [
            {"fieldName": "closed", "suggestedContent": "true", "status": "ACCEPTED",
             "dateCreated": "2026-02-27", ...},
        ],
    },

    "reviews": {
        "FI-00001": [
            {"rating": 2, "content": "Joulupäivänä ovet kiinni...", "written_on": date(2024, 12, 27), ...},
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

Scores from 7 Nov onwards are without the reviews clue, which hasn't had its first full run yet.

**Tried and dropped:**
- Skipping last-year guesses with low confidence: lowered the score at every cut-off in both seasons. The newest year is right more often than not, even when years disagree.
- Guessing peers' typical special hours (e.g. "10–13"), and using the closed share *among businesses that entered something*. Both lost points at every threshold (score fell to 42.66), because most businesses with no history keep their normal hours.
- Applying peers' typical *change* to the business's own hours (e.g. "cafés close 5 h early on Christmas Eve"), learned from other businesses' past entries. Best result 62.63 (2026) and 59.56 (2025), both below the current code. Of 255 such suggestions on 2026 dev businesses, 212 went to owners who had kept their normal hours.
- Type habits for every business, also those with their own history: lowered the score at every cut-off, because the type's habit overruled the owner's own entries.
- Type habits below 80%: at 50–70% the wrong "closed" guesses cost more than the right ones earned. Measuring the rate only on days Google showed the business open didn't help either.
- A small local model (`qwen3:1.7b`) without help read Finnish "ovet olivat kiinni" (the doors were closed) as *open* every time. A word table in the instructions fixed it.
- Setting each clue's confidence to how often it was right in the other season: about −1 in both seasons. Peers is right 77–100% of the time on average, but mostly on days everyone closes anyway. When it disagrees with the owner's own history, the owner is usually right.
- Guessing from the owner's habit on other holidays: owners who were closed on every other public holiday they entered were only closed about half the time on the ones they skipped. Together with a type rate of 0.5–0.8 it only breaks even.

## Where the points are lost

2026 season, dev businesses, without the reviews clue. 5,398 points are available; we get 3,509.

| What happens | Points lost |
|---|---|
| Owner never entered this day, the real hours were different (e.g. NYE closing early) | 584 |
| Owner never entered this day, it was really closed | 481 |
| We suggested open when it was closed, or the other way round | 376 |
| We messaged an owner whose hours were already right | 262 |
| Our hours were close but not exact | 104 |
| Closed for good, not flagged | 21 |

The 2025 back-test looks the same. The biggest lesson so far: owners who skip a holiday mostly keep their normal hours. For the same type of business, the share that closes is much lower among owners who never told us anything than among everyone. So guesses for owners without history have to be careful.

## Ideas to improve accuracy

Each idea starts from why it should work for real businesses, not from the dev scores. The dev answers were only used to check whether a data source can be trusted.

1. **Closed for good.** Flag businesses that reviews ("suljettu pysyvästi", "stängt för gott") and Google edits say have shut down. 22 dev rows, each worth a full point. Next on the list.
2. **Strangers' holiday edits as a stand-in for the owner.** When a Google user reports "closed on 26 Dec", they were usually there: on dev businesses these edits matched what really happened 883 times out of 984. Even edits the owner *rejected* were right 286 times out of 321, so owners reject without checking. Use them like a last-year entry, with lower confidence, for owners who never entered that holiday themselves. Impact not measured yet.
3. **Owners who changed their normal hours and never updated the listing.** Customers notice and suggest new weekly hours. Where the listing really is outdated, those edits showed the real hours 31 times out of 45, and 17 of the 22 dev businesses with outdated hours have one. But on listings that are up to date, the edits are almost always wrong (1 right out of 478). So only act when there's a second sign: a review like "Aukioloajat ovat muuttuneet, netissä on vanhat tiedot" (89 reviews say this), or several edits agreeing. One fix covers every day the owner keeps normal hours, and it's a useful suggestion for the product on its own.
4. **Reviews that give a time.** "Closed already at 20:00 although online it said 14:00–22:00" tells us the hours were 14–20, not just "closed early". 268 reviews mention a time this way. Careful: in "Tultiin klo 18.20 ja ovet olivat jo kiinni" the time is when the customer arrived, so it's only the latest possible closing time.
5. **Last year's confidence.** One year of history shouldn't count as certain, and an entry from several years ago says less than last year's. In 2026 a suggestion based on a 2023 entry earned +0.42 on average, one based on 2025 earned +0.87. With lower confidence for both, the shopping centre wins the arguments it's usually right about: when the centre and last year disagree, the centre is right 35 times against 27 (2025: 33 against 19), but today we pick last year about three times as often. The score effect is small (±0.2), but the reasoning holds.
6. **Don't repeat what the owner rejected** in the 2025 pilot. Only 7 dev rows, but it's how a real service should behave.
7. **The days between Christmas and New Year.** The last-year clue uses the newest of those days for all of them. Matching by weekday, or by which of the days it is, should fit owners who close for part of the week.
8. **Events, school holidays and snow.** Few rows, but three demo stories need them: the bar next to the arena (FI-D0010), the play centre in school holidays (FI-D0014) and the ski rental waiting for snow (FI-D0005).

## AI ideas we haven't built yet

1. **Reviews that don't name the holiday.** "Came here on the holiday but it was closed" could be matched to the nearest holiday by the date the review was written.
2. **An AI judge for disagreements.** When clues disagree (a few hundred cases per season), give a model all the evidence: the owner's past entries, the centre's hours, reviews, edits, what similar businesses do. Ask for the hours, how sure it is and a reason for the owner. This is the kind of judgement where rules struggle, like "the centre published new hours, but this owner has kept their own hours for three years".
3. **Reading times and changes from reviews.** A model can pull "closed at 20:00", "klo 16.20" or "kl. 14" out of any language and tell apart "closed at" from "arrived at". That's what ideas 3 and 4 above need.
4. **Spotting outdated normal hours.** Per business, give the model its reviews, its weekly-hours edits and its current listing, and ask: have the normal hours changed, and to what?
5. **Trends in searches and phone calls** (`analytics_daily.parquet`). A spike in phone calls on last year's holiday, while Google showed the business open, suggests people called because the door was shut, so the hours were probably wrong that day. The same data shows trends over the years, like a type of business slowly closing earlier, and which suggestions matter most because many people search for that business. Needs pandas and pyarrow, so it would be a preprocessing step.
6. **An owner profile.** A model reads an owner's whole history and describes their habits ("closes on public holidays, short hours on eves, follows the centre"), then predicts the days they skipped. The simple rule version only broke even (see above), so this needs a careful test.
7. **Which events matter.** A model reads the event names and keywords in `local_events.json` and decides which nearby businesses get a busy evening: the bar next to the arena, not the dentist.
8. **Writing the owner messages.** Turn the clues' reasons into a short message in the owner's language (fi/sv/nb), and understand free-text replies like "we close at 3 instead".

## Next steps

1. Finish reading the reviews, score the reviews clue on both seasons and set `REVIEW_CONFIDENCE`. On dev businesses, about 9 in 10 reviews read as "closed" were about days the business really was closed.
2. Use the closing times from "closed early" reviews to suggest shorter hours.
3. Export the review readings with business IDs (`review_readings.csv`), so the website and the owner messages can quote them.
4. The AI judge for when clues disagree (AI idea 2).
5. Ideas 2 and 3 above: they use data we don't use at all yet.
