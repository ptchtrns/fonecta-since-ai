# Token Burners – Connect Suggests

Our entry for the Fonecta challenge at Since AI Hackathon 2026. For setting up and developing the web app and worker, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Run it

Predictions (Python 3.9+, standard library only), from the repo root. They read the local database, so fill that first (needs Node, pnpm and uv):

```sh
pnpm install && pnpm db:migrate && pnpm db:seed

python3 apps/predictor/run.py                 # 2026 season → predictions_2026.csv + score on dev businesses
python3 apps/predictor/run.py --season 2025   # back-test as if today were 6 Nov 2025
python3 apps/predictor/run.py --save local    # also show the 2026 predictions on the dashboard
uv run apps/predictor/train.py --check       # retrain the decider after changing a clue (needs scikit-learn, uv installs it)
```

**Demo video** (2:23, 1080p, captions, no sound): [docs/connect-suggests-demo.mp4](docs/connect-suggests-demo.mp4). The five steps on two businesses: Kahvila Kipinä, a dataset business with no history (what the dashboard's numbers mean, its suggestions and why, contact preferences, an answer and what the predictor learns from it), and Business Lunch House in our Yext sandbox (its WhatsApp message on a phone, the no-login page, an edit written to the real Yext API, and the sites that show it). It ends with the results on businesses the model never saw.

To see the whole loop locally, start the web app (`pnpm dev`) and sign up at `/login?mode=sign-up`, choosing one of the demo businesses from the list. To publish approved hours to the dataset's Yext mock, run `python3 data/fonecta-connect-suggests-2026/mock_api/server.py` and set `YEXT_MOCK_URL` in `apps/web/.dev.vars`. The mock only accepts changes to hours and name, so edits to other business details show its error.

For the suggestions to update after each answer, run the worker in a second terminal (`cd apps/worker && uv run worker`, see [apps/worker/README.md](apps/worker/README.md)). It re-runs the predictor for the business that was answered and the dashboard shows the new suggestions.

With `YEXT_API_URL` and `YEXT_API_KEY` set to the team's Yext sandbox, the sandbox's businesses are in the list too, marked "Yext". Their changes go to the real Yext API. Run the predictor with `--save local` after taking one on, so it gets suggestions.

## The five steps

- **Detect:** `apps/predictor` compares what Google shows with what each business most likely does on every special day. Clues propose hours and report their evidence: the business's own past entries, its shopping centre, similar businesses, how often its type closes, and customer reviews read by language models. A model trained on earlier seasons and the 2025 pilot's answers weighs the options and suggests one only when it expects it to be right more often than wrong. Businesses that customers say have shut down for good are flagged for a person to check. See [apps/predictor/README.md](apps/predictor/README.md).
- **Suggest:** the dashboard lists a business's suggestions with the reasons, most important first: how sure the predictor is, how many Google views that day had last season, and how soon it is. Each is also compared with pages the owner linked under Sources.
- **Contact:** one suggestion at a time, most important first, in the owner's language. It goes to every channel the owner turned on under Integrations: WhatsApp, Telegram (the owner connects the bot with one tap and answers with its buttons) and email through Resend (with a link to the no-login answer page). Until they turn one on, it goes to the preferred channel in their customer record; text messages, app notifications and email to the record's address are recorded in an outbox and shown on the Integrations page, as those aren't connected in the demo. An answer on any channel, the link or the dashboard moves the conversation on. An owner who opted out gets no messages and can turn them back on there. Messages wait for the owner's contact hours (e.g. 12-16, in the business's time zone); the scheduled run is hourly for that. A suggestion that a linked page disagrees with is never sent. The `RESEND_*` and `TELEGRAM_*` settings are in `apps/web/.dev.vars.example`.
- **Owner decides (no login):** the message asks a yes-or-no question that its buttons answer ("Yes, we're closed", "No, we're open", "Keep as it is"), and links to a page that needs no login with the same three answers: confirm, edit or dismiss. The token in the link only answers that one suggestion. The dashboard offers the same three answers. Every answer makes the worker predict the business again within seconds: declined hours are never suggested again for that holiday, and approved or edited hours count as the owner's own word, so they change how likely the other days are too.
- **Apply + confirm:** an approved change is written to Yext. Yext replaces the whole hours object, so the app reads the hours Yext has now and changes only the approved date. The owner is told which sites show it and how soon: for the sandbox's businesses the sites come from Yext's Listings API. If Yext rejects it nothing is recorded, so the suggestion stays open. Without a Yext connection the decision is saved and the UI says it isn't live yet. Standing permission applies public holidays without asking when the predictor is at least 70% sure and no linked page disagrees.

## Results

Measured with `uv run apps/predictor/train.py --check`: each dev business is decided by a model trained without it, as the organisers' hidden test businesses will be, and scored with the organisers' scorer. Their baseline scores 54.5%.

| 2026 season, 802 dev businesses | Days | Score | Suggestions with exactly the right hours | Right about open or closed | Lookups that would have hit a closed door, prevented |
| --- | --- | --- | --- | --- | --- |
| All days | 11,100 | 68.3% | 86% | 91% | 87.5% |
| The owner had entered that holiday before | 4,484 | 85.7% | 88% | 94% | 96.0% |
| The owner never had | 6,616 | 30.1% | 77% | 80% | 67.1% |

The 2025 back-test, as if it were 6 Nov 2025, splits the same way: 65.2% overall, 87.1% where the owner had entered the holiday before and 36.6% where they never had.

Where the owner has told us before, the suggestions are nearly always right. Without that, there is less to go on and most owners keep their normal hours, so the predictor speaks up less: it suggests something on 880 of those 6,616 days. Every answer an owner gives adds to their history, which is why the app re-predicts the business right after each one.

## Data sources that mattered most (3–5)

| Signal | How we used it | Where Connect would get it in production |
|---|---|---|
| Past holiday entries (`holiday_hours_history.jsonl`) | Suggest what the owner entered for the same holiday in earlier years; confidence from how many years agree, recent years counting more | Connect's own audit log of exception hours |
| Published listing (`entities.json`) | What Google shows now, to tell which suggestions are needed and which would be needless | Yext Knowledge Graph *Entities* |
| Shopping-centre hours (centres in `entities.json` and their history) | Shops inside a centre get the centre's exact hours for days the centre has published; this beats the shop's own last-year entry | Centres' own websites or their Yext feeds, usually published 4–8 weeks before Christmas |
| What really happened, and owners' answers (`dev_truth_history.csv`, `pilot_decision_log_2025.csv`) | The decider learns from earlier seasons which suggestions turn out right and when to stay quiet. The pilot's approvals, edits and declines include businesses outside the training set | Every approve, edit and decline in Connect, plus what owners later entered themselves |
| Peer benchmarks (`peer_benchmarks.csv`) | For businesses with no history: suggest "closed" when at least 20% of similar businesses close | Connect's own aggregated customer data |

## What we tried that didn't work

- **Skipping last-year guesses with low confidence.** Lowered the score at every cut-off in both seasons. Even when an owner's past years disagree, the newest year is right more often than not.
- **Using peers' typical special hours** (e.g. "similar cafés are open 10–13"). Lost points at every threshold: a median across businesses with different normal hours rarely matches one business exactly.
- **Counting only peers who entered something.** "100% of the cafés that entered something were closed" was still usually wrong, because most businesses enter nothing and keep their normal hours.
- **Applying peers' typical change to the business's own hours** (e.g. "cafés close 5 h early on Christmas Eve" applied to its own opening hours). Lowered the score in both seasons. Of 255 such suggestions, 212 went to owners who had simply kept their normal hours. Businesses without history almost always keep normal hours, so learning from owners who did enter something over-suggests changes.
- **A small language model on a laptop for reading reviews.** `qwen3:1.7b` read Finnish "ovet olivat kiinni" (the doors were closed) as *open* every time.
- **Asking the model for everything in one question.** When we asked for the closing time in the same question as "what did the customer find?", the model started inventing times and then answered "closed early" for reviews where the business was closed all day: 219 of 300 right instead of 293. Two short questions fixed it.
- **Customer activity and owners' review replies as extra evidence.** On closed days customer actions drop (searches don't), and owners reply "we forgot to update our holiday hours" about 450 times. Both separate closers from the rest when looked at alone, but the decider got no better on businesses it never saw: the business type and the owner's own history already carry the same information.
- **"Close" times as a hedge.** The scorer gives partial points for hours within 30 minutes, but true times are almost all on the hour and our misses were an hour or more off. A half-hour guess between two likely closing times never beats the likelier one.
- **One reading model for all three countries.** Mistral-Small 24B reads Swedish and Norwegian well, but translated Finnish "Kiva että olitte auki" (glad you were open) as "I wish you had been open". Reviews of Finnish businesses now go to Qwen2.5-72B, which read all of those correctly.

## Customer with no history / no previous actions

When an owner has never entered anything for a holiday, the predictor falls back to other evidence:

- **How often the same type of business really closes** on that holiday in the same country, learned from the true hours of the training businesses.
- **What similar businesses entered** (same country, city size and type).
- **How the owner behaves on other days**, if they have entered anything at all: how often they entered "closed", and how long ago.
- **Recent reviews** where customers found the doors closed on that holiday, and **Google users' suggested hours** for the same holiday last time.
- **Seasons and snow:** summer terraces in winter, ski rentals in summer, and ski rentals when there isn't enough snow.

The clues report this evidence even when it's too weak for a guess of their own, and the decider, which learned from earlier seasons how often each combination turned out right, suggests only when it expects to be right more often than wrong. Usually it stays quiet, because owners with no history mostly keep their normal hours, and a wrong "closed" costs as much as a right one earns. `FI-D0017` Kahvila Kipinä shows this: sign up with it and it gets five suggestions, for example Epiphany closed because "54% of businesses like yours were closed on this day in earlier years", and nothing on the days where the evidence is weaker. The demo video shows this from sign-up, and what one answer changes: once the owner confirms Christmas Day closed, Epiphany closed goes from 51% to 64% sure, with a new reason, "You were closed on most of the special days you have told us about".

## Final customer messages (as text)

These are generated with the app's own message code (`apps/web/src/lib/messages.ts`), for real demo businesses and their first suggestion of the 2026 season. On WhatsApp the text between stars shows in bold and the answers in brackets are buttons. The link opens a page where the owner answers without logging in.

**Finnish**, Kahvila Kipinä (FI-D0017), Christmas Day:

> Hei Aino! *Vahvista aukioloaikasi: Joulupäivä pe 25.12.*
> Ehdotamme: *suljettu*. Google näyttää nyt 08:00–17:00.
> Noin 65 ihmisen odotetaan etsivän sinua sinä päivänä. Oikeat ajat säästävät heidät turhalta matkalta.
>
> 38% samanlaisista lähialueen yrityksistä kertoo olevansa kiinni tänä päivänä.
>
> Muokkaa tai katso perustelut: https://…/s/…
> [Vahvista suljettu] [Auki – muokkaa ajat] [Ohita]

After approving:

> Valmista! pe 25.12. suljettu on päivitetty.
> Näkyy nyt: Google (Search & Maps), Facebook, Finder.fi / Fonecta.fi, Fonecta Caller.
> Bing, Apple Maps, Waze (via Google), Tripadvisor, AI assistants (via Bing/Apple data): 7 d kuluessa.

**Swedish**, Kafé Linnea (SE-D0008), Christmas Eve:

> Hej Maria! *Bekräfta era öppettider: Julafton tors 24.12.*
> Vi föreslår: *stängt*. Google visar nu 08:00–18:00.
> Omkring 199 personer väntas söka efter er den dagen. Rätt tider sparar dem en onödig resa.
>
> Baserat på vad du angav för den här dagen tidigare år.
>
> Ändra eller se varför: https://…/s/…
> [Bekräfta stängt] [Öppet – ändra tider] [Hoppa över]

After declining:

> Okej, vi låter tiderna vara och frågar inte om den här dagen igen.

**Norwegian**, Bakeri Fjord (NO-D0009), Christmas Day:

> Hei Marte! *Bekreft åpningstidene deres: Første juledag fre 25.12.*
> Vi foreslår: *stengt*. Google viser nå 07:00–18:00.
> Rundt 18 personer ventes å søke etter dere den dagen. Riktige tider sparer dem en unødvendig tur.
>
> Basert på det du oppga for denne dagen tidligere år.
>
> Endre eller se hvorfor: https://…/s/…
> [Bekreft stengt] [Åpent – endre tider] [Hopp over]

After tapping the edit button:

> Endre eller se hvorfor: https://…/s/…

After saving 10:00–14:00 on that page:

> Ferdig! fre 25.12. 10:00–14:00 er oppdatert.
> Vises nå på Google (Search & Maps), Facebook.
> 1881.no, Bing, Gule Sider, Apple Maps, Waze (via Google), Tripadvisor, AI assistants (via Bing/Apple data), Foursquare: innen 7 d.

**English**, for an owner who chose English, the same suggestion as for Kahvila Kipinä:

> Hi Aino! *Confirm your Christmas Day hours (Fri 25.12.)*
> We suggest: *closed*. Google now shows 08:00–17:00.
> About 65 people are expected to look you up that day. Keep your hours right so nobody makes a wasted trip.
>
> 38% of similar businesses nearby have told us they close on this day.
>
> Edit or see why: https://…/s/…
> [Confirm closed] [We're open – edit] [Dismiss]

After approving:

> Done! Fri 25.12. closed is updated.
> Live now on Google (Search & Maps), Facebook, Finder.fi / Fonecta.fi, Fonecta Caller.
> Bing, Apple Maps, Waze (via Google), Tripadvisor, AI assistants (via Bing/Apple data): within 7 d.

After declining:

> Got it, we'll leave your hours as they are and won't ask about this day again.

After tapping the edit button, then saving 10:00–14:00:

> Edit or see why: https://…/s/…

> Done! Fri 25.12. 10:00–14:00 is updated.
> Live now on Google (Search & Maps), Facebook, Finder.fi / Fonecta.fi, Fonecta Caller.
> Bing, Apple Maps, Waze (via Google), Tripadvisor, AI assistants (via Bing/Apple data): within 7 d.

After standing permission ("Handle public holidays without asking"):

> As agreed, we've updated the hours for Tilitoimisto Otso: Fri 25.12. closed, Fri 1.1. closed.

## Bonus: live source

**Replaced:** `entities.json` and `listings.json`, for the businesses in the team's Yext sandbox (Knowledge Graph *Entities* and *Listings*). They show up in the business search next to the dataset's. Taking one on copies it into the database, so the dashboard and the predictor treat it like any other business, and it is read from Yext again each time its dashboard opens. Approved changes go back to the sandbox. A real write was tested on Business Lunch House: Christmas Eve changed, the weekdays and the other dates stayed as they were, and the confirmation listed the 11 live sites. The hours were then put back as they were.

What we learned:

- **Coverage:** the account has two locations, both in Tampere. Business Lunch House has weekly hours and five holiday dates already entered for Christmas to Epiphany. The Boys Club has no hours at all.
- **Quality:** Fonecta's category id (`R21005287`) isn't one of the dataset's types. The type is guessed from the name and description, and "lunch" makes Business Lunch House a lunch restaurant. The type decides which similar businesses the predictor compares with.
- **Listings:** 11 publishers are live: Google, Facebook, Bing, Foursquare, HERE, MapQuest, Navmii, ShowMeLocal, TomTom, Tupalo and WhereTo. Google and Facebook say `NOT_CONNECTED`, meaning the owner's own accounts aren't linked. There are no Nordic directories and no Apple Maps. The API gives no update speeds, so "shows it within…" uses the dataset's figures where it has the publisher and three days otherwise.
- **Gaps:** no reviews, no publisher suggestions and no exception-hour history. Analytics reports answered with an internal server error. So nothing tells the predictor what this owner did before, and it relies on what similar businesses do: Business Lunch House gets one suggestion, Christmas Eve closed (84% sure), when that date has no entry yet. For the demo video we removed its Christmas Eve entry first; the owner's edit in the video put it back as it was.

## Third-party code, data and licences

| Component | Licence |
|---|---|
| Connect Suggests simulator dataset, Since AI ry 2026 (`data/fonecta-connect-suggests-2026`) | Data CC BY 4.0, code MIT |
| `apps/predictor` | Python standard library only to run. Training the decider uses [scikit-learn](https://scikit-learn.org) and [NumPy](https://numpy.org) |
| scikit-learn, NumPy | BSD 3-Clause |
| Qwen2.5-72B-Instruct, used through Featherless to read reviews of Finnish businesses | Qwen licence (commercial use allowed below 100 million monthly users) |
| Mistral-Small-24B-Instruct-2501, used through Featherless to read reviews of Swedish and Norwegian businesses | Apache 2.0 |
| Web app: [SolidJS](https://www.solidjs.com) (`solid-js`, `@solidjs/router`, `@solidjs/meta`, `@solidjs/web`, `@solidjs/vite-plugin`), [Better Auth](https://www.better-auth.com), [Zod](https://zod.dev), [Tailwind CSS](https://tailwindcss.com), [daisyUI](https://daisyui.com), [Vite](https://vite.dev), [Vite+](https://viteplus.dev), `filesystem-routing`, `@cloudflare/vite-plugin` | MIT |
| [Drizzle ORM](https://orm.drizzle.team) (`drizzle-orm`), TypeScript | Apache 2.0 (Drizzle Kit: MIT) |
| Wrangler | MIT or Apache 2.0 |
| Worker: [HTTPX](https://www.python-httpx.org), [python-dotenv](https://github.com/theskumar/python-dotenv) | BSD 3-Clause |
| Data import script: [PyArrow](https://arrow.apache.org) | Apache 2.0 |
| Site and channel logos from [Logo.dev](https://www.logo.dev) (needs `VITE_LOGO_DEV_TOKEN` in `apps/web/.env`, see `.env.example`; the free plan requires the "Logos provided by Logo.dev" link on the landing page) | Logo.dev terms |
| Fallback publisher logos from [Simple Icons](https://simpleicons.org) | CC0 |
| Icons from [Lucide](https://lucide.dev) | ISC |

No GPL/AGPL components without Fonecta's written approval.
