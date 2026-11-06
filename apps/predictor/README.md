# Predictor

Decides, for every business and special day from 7 Nov 2026 to 6 Jan 2027, whether to **suggest** new hours, **flag** the business for a human, or **do nothing**. Its output is `predictions_2026.csv`, which the organisers score.

Plain Python, standard library only. Reads the data files directly. It doesn't use the web app's database, because that only holds the 32 demo businesses.

## Run it

From the repo root:

```sh
python3 apps/predictor/run.py
```

## Files

| File | What it does | Status |
|---|---|---|
| `load.py` | Reads every data file once and groups the rows by business | Done |
| `hours.py` | `shown_on_google(business, day)`: what Google shows now. Checked against the labels: 0 differences | Done |
| `run.py` | Goes through every question, asks the clues, writes predictions, prints the score | Working, last-year clue only |
| `combine.py` | Picks the best guess from the clues, or none | Empty |
| `clues/last_year.py` | Same business, same holiday, last year | Done |
| `clues/mall.py` | Shop inside a mall: use the mall's hours | Empty |
| `clues/peers.py` | No history: what similar businesses do | Empty |
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

## Next steps

1. "What does Google show now" helper
2. Loop + scorer in `run.py` (score 0 with no clues)
3. `clues/last_year.py`
4. `clues/mall.py`, `clues/peers.py` (with special hours, not just "closed"), `clues/closed_for_good.py`
5. Tune the confidence cut-off on 2025, check on 2026
