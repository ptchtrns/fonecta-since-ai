# TODO team name – Connect Suggests

Our entry for the Fonecta challenge at Since AI Hackathon 2026. For setting up and developing the web app and worker, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Run it

Predictions (Python 3.9+, standard library only), from the repo root. They read the local database, so fill that first (needs Node, pnpm and uv):

```sh
pnpm install && pnpm db:migrate && pnpm db:seed:full

python3 apps/predictor/run.py                 # 2026 season → predictions_2026.csv + score on dev businesses
python3 apps/predictor/run.py --season 2025   # back-test as if today were 6 Nov 2025
python3 apps/predictor/run.py --save local    # also show the 2026 predictions at /dashboard/suggestions
```

Demo: TODO

## The five steps

- **Detect:** `apps/predictor` compares what Google shows with what each business most likely does on every special day, using the business's own past entries, its shopping centre, similar businesses and customer reviews read by language models. Businesses that customers say have shut down for good are flagged for a person to check. See [apps/predictor/README.md](apps/predictor/README.md).
- **Suggest:** TODO
- **Contact:** TODO
- **Owner decides (no login):** TODO
- **Apply + confirm:** TODO

## Data sources that mattered most (3–5)

| Signal | How we used it | Where Connect would get it in production |
|---|---|---|
| Past holiday entries (`holiday_hours_history.jsonl`) | Suggest what the owner entered for the same holiday in earlier years; confidence from how many years agree, recent years counting more | Connect's own audit log of exception hours |
| Published listing (`entities.json`) | What Google shows now, to tell which suggestions are needed and which would be needless | Yext Knowledge Graph *Entities* |
| Shopping-centre hours (centres in `entities.json` and their history) | Shops inside a centre get the centre's exact hours for days the centre has published; this beats the shop's own last-year entry | Centres' own websites or their Yext feeds, usually published 4–8 weeks before Christmas |
| Weekly hours history (`regular_hours_history.jsonl`) | Move last year's hours to this year's weekday, e.g. "normal opening, close at 17" | Connect's audit log of published hours |
| Peer benchmarks (`peer_benchmarks.csv`) | For businesses with no history: suggest "closed" when at least 20% of similar businesses close | Connect's own aggregated customer data |

## What we tried that didn't work

- **Skipping last-year guesses with low confidence.** Lowered the score at every cut-off in both seasons. Even when an owner's past years disagree, the newest year is right more often than not.
- **Using peers' typical special hours** (e.g. "similar cafés are open 10–13"). Lost points at every threshold: a median across businesses with different normal hours rarely matches one business exactly.
- **Counting only peers who entered something.** "100% of the cafés that entered something were closed" was still usually wrong, because most businesses enter nothing and keep their normal hours.
- **Applying peers' typical change to the business's own hours** (e.g. "cafés close 5 h early on Christmas Eve" applied to its own opening hours). Lowered the score in both seasons. Of 255 such suggestions, 212 went to owners who had simply kept their normal hours. Businesses without history almost always keep normal hours, so learning from owners who did enter something over-suggests changes.
- **A small language model on a laptop for reading reviews.** `qwen3:1.7b` read Finnish "ovet olivat kiinni" (the doors were closed) as *open* every time.
- **Asking the model for everything in one question.** When we asked for the closing time in the same question as "what did the customer find?", the model started inventing times and then answered "closed early" for reviews where the business was closed all day: 219 of 300 right instead of 293. Two short questions fixed it.
- **One reading model for all three countries.** Mistral-Small 24B reads Swedish and Norwegian well, but translated Finnish "Kiva että olitte auki" (glad you were open) as "I wish you had been open". Reviews of Finnish businesses now go to Qwen2.5-72B, which read all of those correctly.

## Customer with no history / no previous actions

When an owner has never entered anything for a holiday, the predictor falls back to other evidence:

- **How often the same type of business really closes** on that holiday in the same country, learned from the true hours of the training businesses. It suggests "closed" when at least 80% of them closed.
- **What similar businesses entered** (same country, city size and type): "closed" when at least 20% of them entered closed.
- **Recent reviews** where customers found the doors closed on that holiday, and **Google users' suggested hours** for the same holiday last time.
- **Seasons and snow:** summer terraces in winter, ski rentals in summer, and ski rentals when there isn't enough snow.

Otherwise it stays quiet, because owners with no history almost always keep their normal hours (see above). TODO: show `FI-D0017` Kahvila Kipinä in the demo.

## Final customer messages (as text)

TODO

## Bonus: live source

TODO

## Third-party code, data and licences

| Component | Licence |
|---|---|
| Connect Suggests simulator dataset, Since AI ry 2026 (`data/fonecta-connect-suggests-2026`) | Data CC BY 4.0, code MIT |
| `apps/predictor` | Python standard library only |
| Qwen2.5-72B-Instruct, used through Featherless to read reviews of Finnish businesses | Qwen licence (commercial use allowed below 100 million monthly users) |
| Mistral-Small-24B-Instruct-2501, used through Featherless to read reviews of Swedish and Norwegian businesses | Apache 2.0 |
| TODO: web app and worker dependencies | |

No GPL/AGPL components without Fonecta's written approval.
