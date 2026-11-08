# Predictor

The predictor decides, for every business and special day from 7 Nov 2026 to 6 Jan 2027, whether to suggest new hours to the owner, flag the business for a person to check, or do nothing. Its output is `predictions_2026.csv`, which the organisers score, and the suggestions the dashboard shows.

How the code works is described in [TECHNICAL.md](TECHNICAL.md).

## Run it

The predictor reads the web app's local database, so fill that first. From the repo root, once per clone and after any reseed (needs Node, pnpm and uv, see `docs/DEVELOPMENT.md`):

```sh
pnpm install && pnpm db:migrate && pnpm db:seed
```

Then:

```sh
python3 apps/predictor/run.py                 # 2026 season: predictions_2026.csv and the score
python3 apps/predictor/run.py --season 2025   # back-test: pretends today is 6 Nov 2025
python3 apps/predictor/run.py --save local    # also show the 2026 predictions on the dashboard
python3 apps/predictor/run.py --save remote   # the same for the deployed site, demo businesses only
```

A run takes about 20 seconds and needs only the Python standard library. It stops with an error if the database holds only the limited set (`pnpm db:seed:limited`), which has no training data.

`--save` replaces the `prediction` table, which the dashboard's front page shows. Run `pnpm db:migrate:remote` in `apps/web` before the first `--save remote`. Reseeding empties the table, so save again afterwards.


After changing a clue, train the decider again. This needs scikit-learn, which `uv run` installs, and takes about two minutes. `--check` adds three more and shows how well it does on businesses it has never seen:

```sh
uv run apps/predictor/train.py --check
```

Customer reviews are read by language models on [Featherless](https://featherless.ai). Every answer is saved in `ai_cache.json`, which is committed, so a run only needs the key when there are new reviews. Put it in the `.env` file in the repo root:

```
FEATHERLESS_API_KEY=...
```

To read new reviews in batches and keep an eye on the cost (reading all 1,350 reviews cost about 10 cents):

```sh
python3 apps/predictor/read_reviews.py 300     # read the next 300 unread reviews
python3 apps/predictor/read_reviews.py clean   # drop cached answers nothing uses any more
```

## How it decides

For each business and day, the predictor first checks whether anything needs deciding. If the business seems to have shut down for good, it is flagged for a person. If the owner has already answered a suggestion for the day, or entered hours for it, the predictor stays quiet: the owner has the last word.

Otherwise it collects clues. Each clue looks at one kind of evidence and may propose hours:

- what the owner entered for the same holiday in earlier years
- the hours the shopping centre has published for the day
- what customers found on the same holiday last year, from their reviews
- how often similar businesses and businesses of the same type close
- hours a Google user suggested last time
- seasonal breaks, and for ski rentals, the snow
- new normal hours a customer wrote down, like "Now only open Mon-Fri 10-18, Sat 10-15"

Clues that propose the same hours back each other up, and each of them gives the owner a reason. Clues also report the evidence behind them even when they stay silent, for example that 45% of cafes closed, which is too few to suggest closing on its own.

The decider then weighs the options. It is a model that learned from earlier seasons which combinations of evidence turned out right. For each option it predicts how many points the suggestion would earn, and suggests the best one only if it expects to be right more often than wrong. A wrong suggestion costs as much as a right one earns, and owners who never tell us anything mostly keep their normal hours, so staying quiet is often the better choice.

When the decider stays quiet, one more clue gets its say: a customer review that states the business's new normal hours, like "Nykyään auki vain ma-pe 7.30-18, la 9-17". Owners who change their normal hours often forget the listing, and customers notice. These reviews matched the true current hours on every weekday checked. The decider can't learn this clue, because past seasons have almost none of these reviews, so it comes after the decider instead of inside it.

The model learned from the training businesses' true hours in the 2024 and 2025 seasons and three springs, and from the owners' answers in the 2025 pilot. The back-test's model only learned from what was known before 6 Nov 2025.

## Learning from owners' answers

The predictor reads the 2025 pilot's answers and the answers given in the web app.

- Approved or edited hours become the owner's own entry for that holiday, so next year the last-year clue suggests them. In the pilot, edited hours matched what the owner really did 26 times out of 26.
- Rejected hours are never suggested for that holiday again. In the pilot they were wrong all 28 times we can check. But only 11 of those owners kept what Google showed, so a rejection tells us what's wrong, not what's right.
- A day the owner has already answered is not asked about again.
- Hours approved or edited in the web app also count as something the owner has told us, like their own entries. So one answer changes the other days too: when the owner of Kahvila Kipinä (FI-D0017), who has no history, approves "closed" for Christmas Day, the predictor becomes surer they also close on Epiphany (0.51 to 0.65). Owners with years of history move much less.
- The pilot's answers are also training examples for the decider. In the product, every approve, edit and decline could be one.

Right after an owner answers, the web app asks the worker to predict that business again (`run.py --business`, about 3 seconds), and the dashboard shows the new suggestions. See "One business at a time" in [TECHNICAL.md](TECHNICAL.md).

## Scoring and rules

Right hours earn 1 point and hours within 30 minutes 0.6. Getting open or closed the wrong way round costs 1 point, and messaging an owner whose hours were already right costs 0.1 to 0.5. The organisers' baseline (copy last year, then the shopping centre, then peers) scores 54.5.

- The answers in `labels/` are only used to check the score and as training data.
- Nothing entered, published or written on or after the snapshot date is used. `load.py` drops it.
- A change should improve both seasons. The organisers score hidden businesses, and real customers have longer histories than this dataset, so rules should make sense for real owners, not just fit these numbers.

## Scores so far

| Change                                                                                               | 2026  | 2025 back-test |
| ---------------------------------------------------------------------------------------------------- | ----- | -------------- |
| Do nothing                                                                                           | 0     | -              |
| Last year's hours                                                                                    | 57.85 | -              |
| Plus peers ("closed" when at least 20% of similar businesses close)                                  | 64.14 | 59.95          |
| Last year: confidence from all past years, weekday adjustment                                        | 64.17 | 60.34          |
| Plus the shopping centre's hours                                                                     | 64.58 | 61.40          |
| Clues combined by confidence instead of a fixed order                                                | 64.55 | 61.20          |
| Plus type habits (no own history, at least 80% of the type closed)                                   | 65.00 | 61.80          |
| Plus the closed-for-good flag                                                                        | 65.22 | 61.80          |
| Plus Google edits, snow, seasonal breaks and reviews                                                 | 66.27 | 63.35          |
| Plus owners' answers                                                                                 | 66.69 | 63.36          |
| A learned decider instead of "highest confidence wins"                                               | 67.58 | 65.02          |
| Plus new normal hours that customers wrote down in reviews, and reviews saying "everything was dark" | 68.29 | 65.16          |

The decider's scores come from `train.py --check`, where each training business is decided by a model that never saw it, as the hidden test businesses will be. `run.py` prints higher numbers because the saved models also learned from these businesses' earlier seasons.

`--check` also prints how often the suggestions were right, split by whether the owner had entered that holiday in an earlier year. Where they had, 88% of the suggestions have exactly the right hours and the score is 85.7%; see "Results" in the [main README](../../README.md).

## What we tried that didn't work

- Skipping last year's hours when past years disagree. The newest year is right more often than not, even then.
- Suggesting similar businesses' typical special hours, like "10-13", or their typical change, like "cafes close 5 hours early on Christmas Eve". Most owners without history keep their normal hours, so these mostly went to owners whose hours were already right.
- Using the type's habit for owners who have their own history. It overruled what the owners themselves had entered.
- Treating a day the owner left blank, in a year they entered other days, as "kept normal hours". Only about half of those days really had normal hours, and the score fell to 45.
- Guessing from the owner's habit on other holidays. Owners who closed on every public holiday they entered closed only about half the time on the ones they skipped.
- For the days between Christmas and New Year, matching last year's day by weekday instead of taking the newest. No change: owners enter the same hours for all of those days.
- Taking the middle of past years' closing times. Owners change their hours rather than drift around a typical time, so the newest year was as good or better.
- A half-hour guess between two likely closing times, to earn the partial points. True times are almost all on the hour, so it never beat the likelier time.
- Customer activity from the analytics. On closed days customer actions drop, though searches don't. But the typical business gets about one action a day, so a quiet day means closed only 60% of the time, and the decider gained nothing from it on businesses it hadn't seen. The business type and the owner's history already tell the same.
- Owners' replies to reviews, like "we forgot to update our holiday hours". These owners close more often on public holidays, but again the decider gained nothing.
- Norway's holiday trading law. The dataset's Norwegian shops do close on public holidays, which the type habits already learn, but many stayed open after 16:00 on Christmas Eve, New Year's Eve and Easter Saturday, which the law wouldn't allow.
- Our own decision-tree code instead of scikit-learn. About 0.3 to 0.5 points lower, and ten times slower to train.
- Snow for anything but "no snow, so the ski rental is closed". Snow doesn't say what the hours are, and summer terraces are closed all winter anyway.
- What businesses within a kilometre entered for the same holiday. Owners without history did close more often where their neighbours had, but the decider gained only 0.03 to 0.05 points: the type and peer rates already say the same.
- Trends by area, like a whole town closing an hour earlier. When businesses changed their hours, a business matched its city's most common closing time 28% of the time, against 22% for everyone together and 42% for its own type. The type matters, the town hardly at all.
- Reviews that complain about the hours without naming the holiday, matched to the nearest special day before they were written. Only 20 of 32 "closed" readings matched what really happened that day, against about 9 in 10 for reviews that name the holiday.
- A language model reading everything about a business (all reviews with the owner's replies, Google edits, customer activity on past special days, similar businesses) and judging the days owners never told us about. On 39 businesses it scored 17.7 on those days against the decider's 36.7, and it told closed days apart no better than the type's closing rate alone (0.949 against 0.950 on a scale where 1.0 is perfect). It found nothing in the raw data beyond the numbers we gave it.
- Event nights. About one bar or restaurant in six stays open an hour or two longer, but how big the event is or what kind (hockey, concert, festival) makes no difference, so nothing tells which ones will.
- The type's closing rate counted only among owners who never told us anything, or split by weekday and weekend. Neither ranked the days better than the plain rate.
- Businesses with the same name as a chain. Same-name businesses behaved no more alike than any two businesses of the same type: the names are just reused.
- Last year's hours both as entered and moved to this year's weekday, the most common answer over the years, and where the owner's newest entry came from (the owner, Fonecta support, an accepted suggestion). Better in the 2025 back-test, worse in 2026.
- A small language model on a laptop for reading reviews. It read Finnish "ovet olivat kiinni" (the doors were closed) as open until we gave it a word list.

## Where the points are lost

Measured on the 2026 training businesses before the decider, at a score of 66.69. Each score point is about 54 of the scorer's points.

- 19 score points: owners who never entered the holiday, and closed or changed their hours anyway. We stay quiet, because no evidence makes any guess right more than about half the time.
- 9 points: owners who did something else than last year. The decider holds back some of these suggestions now.
- 3 points: "closed" guesses for owners without history who stayed open.
- 2 points: everything else.

If we knew exactly what every business did on the same holiday last time and repeated it, the score would be 81.9 in 2026 and 71.8 in 2025. Owners change their habits, so even perfect memory stops there.

## Ideas

- Owners who changed their normal hours and never updated the listing, but have no review stating the new hours. 14 of 15 dev businesses with a review like "new owner and new hours, Google has the old ones" really were outdated, but without the new hours the best guess ("opens an hour later", the most common change) would be right only about four times in ten.
- Events and school holidays. Few rows, but two demo stories need them: the bar next to the arena (FI-D0010) and the play centre in school holidays (FI-D0014).
- A language model that writes the owner messages and understands free-text replies like "we close at 3 instead".

## Next steps

1. Add the web app's approvals, edits and declines to the decider's training examples, the way the pilot's answers already are.
2. Offer standing permission to owners who approved the same holiday twice.
