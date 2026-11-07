# TODO team name – Connect Suggests

Our entry for the Fonecta challenge at Since AI Hackathon 2026. For setting up and developing the web app and worker, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Run it

Predictions (Python 3.9+, standard library only), from the repo root. They read the local database, so fill that first (needs Node, pnpm and uv):

```sh
pnpm install && pnpm db:migrate && pnpm db:seed

python3 apps/predictor/run.py                 # 2026 season → predictions_2026.csv + score on dev businesses
python3 apps/predictor/run.py --season 2025   # back-test as if today were 6 Nov 2025
python3 apps/predictor/run.py --save local    # also show the 2026 predictions on the dashboard
```

Demo: TODO

To see the whole loop locally, start the web app (`pnpm dev`) and sign up at `/login?mode=sign-up`, choosing one of the demo businesses from the list. To publish approved hours to the dataset's Yext mock, run `python3 data/fonecta-connect-suggests-2026/mock_api/server.py` and set `YEXT_MOCK_URL` in `apps/web/.dev.vars`. The mock only accepts changes to hours and name, so edits to other business details show its error.

With `YEXT_API_URL` and `YEXT_API_KEY` set to the team's Yext sandbox, the sandbox's businesses are in the list too, marked "Yext". Their changes go to the real Yext API. Run the predictor with `--save local` after taking one on, so it gets suggestions.

## The five steps

- **Detect:** `apps/predictor` compares what Google shows with what each business most likely does on every special day, using the business's own past entries, its shopping centre, similar businesses and customer reviews read by language models. Businesses that customers say have shut down for good are flagged for a person to check. See [apps/predictor/README.md](apps/predictor/README.md).
- **Suggest:** the dashboard lists a business's suggestions with the reasons, most important first: how sure the predictor is, how many Google views that day had last season, and how soon it is. Each is also compared with pages the owner linked under Sources.
- **Contact:** WhatsApp, in the owner's language, one suggestion at a time. The next goes out after the previous is answered. A suggestion that a linked page disagrees with is never sent.
- **Owner decides (no login):** the message has Approve, Edit and No thanks buttons and a link to a page that needs no login. The token in the link only answers that one suggestion. The dashboard offers the same three answers.
- **Apply + confirm:** an approved change is written to Yext. Yext replaces the whole hours object, so the app reads the hours Yext has now and changes only the approved date. The owner is told which sites show it and how soon: for the sandbox's businesses the sites come from Yext's Listings API. If Yext rejects it nothing is recorded, so the suggestion stays open. Without a Yext connection the decision is saved and the UI says it isn't live yet. Standing permission applies public holidays without asking when the predictor is at least 70% sure and no linked page disagrees.

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

Otherwise it stays quiet, because owners with no history almost always keep their normal hours (see above). `FI-D0017` Kahvila Kipinä shows this: sign up with it and it gets four suggestions, all from those sources. TODO: show it in the demo.

## Final customer messages (as text)

From `apps/web/src/lib/messages.ts`, with buttons Approve / Edit / No thanks (in the owner's language):

> Hei Aleksi! Joulupäivä on pe 25.12. Google näyttää nyt 07:30–18:00.
> Perustuu aiempina vuosina tälle päivälle antamiisi aikoihin.
> 39% samanlaisista lähialueen yrityksistä kertoo olevansa kiinni tänä päivänä.
>
> Ehdotamme: *pe 25.12. suljettu*
>
> Muokkaa tai katso perustelut: https://…/s/…

> Hi Aleksi! Christmas Day is on Fri 25.12. Google now shows 07:30–18:00.
> Based on what you entered for this day in previous years.
>
> We suggest: *Fri 25.12. closed*
>
> Edit or see why: https://…/s/…

Confirmation after approving:

> Done! Fri 25.12. closed is updated.
> Live now on Google (Search & Maps), Finder.fi / Fonecta.fi.
> Apple Maps, Bing: within 2 d.

After standing permission:

> As agreed, we've updated the hours for Tilitoimisto Otso: Fri 25.12. closed, Fri 1.1. closed.

## Bonus: live source

**Replaced:** `entities.json` and `listings.json`, for the businesses in the team's Yext sandbox (Knowledge Graph *Entities* and *Listings*). They show up in the business search next to the dataset's. Taking one on copies it into the database, so the dashboard and the predictor treat it like any other business, and it is read from Yext again each time its dashboard opens. Approved changes go back to the sandbox. A real write was tested on Business Lunch House: Christmas Eve changed, the weekdays and the other dates stayed as they were, and the confirmation listed the 11 live sites. The hours were then put back as they were.

What we learned:

- **Coverage:** the account has two locations, both in Tampere. Business Lunch House has weekly hours and five holiday dates already entered for Christmas to Epiphany. The Boys Club has no hours at all.
- **Quality:** Fonecta's category id (`R21005287`) isn't one of the dataset's types. The type is guessed from the name and description, and "lunch" makes Business Lunch House a lunch restaurant. The type decides which similar businesses the predictor compares with.
- **Listings:** 11 publishers are live: Google, Facebook, Bing, Foursquare, HERE, MapQuest, Navmii, ShowMeLocal, TomTom, Tupalo and WhereTo. Google and Facebook say `NOT_CONNECTED`, meaning the owner's own accounts aren't linked. There are no Nordic directories and no Apple Maps. The API gives no update speeds, so "shows it within…" uses the dataset's figures where it has the publisher and three days otherwise.
- **Gaps:** no reviews, no publisher suggestions and no exception-hour history. Analytics reports answered with an internal server error. So nothing tells the predictor what this owner did before, and it relies on what similar businesses do: Business Lunch House gets one suggestion, Christmas Eve.

## Third-party code, data and licences

| Component | Licence |
|---|---|
| Connect Suggests simulator dataset, Since AI ry 2026 (`data/fonecta-connect-suggests-2026`) | Data CC BY 4.0, code MIT |
| `apps/predictor` | Python standard library only |
| Qwen2.5-72B-Instruct, used through Featherless to read reviews of Finnish businesses | Qwen licence (commercial use allowed below 100 million monthly users) |
| Mistral-Small-24B-Instruct-2501, used through Featherless to read reviews of Swedish and Norwegian businesses | Apache 2.0 |
| TODO: web app and worker dependencies | |
| Publisher logos from [Simple Icons](https://simpleicons.org) | CC0 |
| Icons from [Lucide](https://lucide.dev) | ISC |

No GPL/AGPL components without Fonecta's written approval.
