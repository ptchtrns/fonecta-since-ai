# Notes on the review prompt

How we write the instructions for the language model that reads reviews (`INSTRUCTIONS` in `review_reading.py`), and a log of every change and why.

## What makes a good instruction

Mostly from Anthropic's prompting guide (platform.claude.com/docs, "Prompting best practices"), applied to our job of reading one review and answering with one word.

1. **Decide what "right" means before writing, and test against it.** Here: did the model read the review the way a person would? We check every batch against the meaning of each review wording, and against what really happened on that day for the dev businesses.
2. **Clear and direct.** Imagine handing the instruction to a new colleague who knows nothing about the project. If they would have to guess, the model guesses too.
3. **Say why.** One sentence of purpose ("we use this to keep opening hours on Google correct") lets the model handle wordings no rule covers. A rule with its reason works better than a bare rule.
4. **Say what to do, not only what not to do.** "Go by what the customer found" works better than "don't trust the hours in the review".
5. **Define every answer so they don't overlap**, and say what decides between neighbours (closed all day vs closed early).
6. **Examples are the strongest steering, so use few and only where needed**: varied, short, clearly marked as examples, and not copies of the reviews we test on, or the test stops meaning anything.
7. **Keep the input apart from the instruction**, for example inside `<review>` tags, so a review is never mistaken for an instruction.
8. **Say the exact output format**, and keep the prompt's own style plain, since the model mirrors it.
9. **When a mistake shows up, add the missing information, not a patch for that one sentence.** Then re-read everything read so far, so the fix can't quietly break something else.
10. **Start short.** Every added line costs tokens on every review and can confuse a mid-size model (we use Mistral-Nemo, 12B). Add only what the mistakes show is missing.

## How we work

`read_reviews.py` reads the next batch of reviews into `ai_cache.json`. After each batch we look at the mistakes. A few odd ones: carry on. A pattern of mistakes: improve the instruction here, log the change below, and re-read everything so far (a changed instruction means new cache keys, about 300 tokens per review).

## Log

| Version | Change | Why | Result |
|---|---|---|---|
| 1 | Word table (fi/sv/nb/en) + answer definitions | The small local model read Finnish "kiinni" (closed) as open | Local `qwen3:1.7b` 7/8; cloud models 18–22 of 25 test reviews |
| 2 | Clearer definitions with example phrases, no word table, one line naming the trap | Every model called "online it said 10–17, but it was closed" *closed early*: the old definition mentioned "hours shown online" | 14B 24/25, Nemo 24/25 |
| 3 | Examples for "closed for good" in each language | Norwegian "stengt for godt" read as just closed | Nemo 25/25 |
| 4 | Back to a short instruction with one rule: go by what the customer found, not what Google said. Review inside `<review>` tags | Start short and add only what batches show is missing | 293/300. Mistakes: 6× "the place was dark, Google said 12–16" read as closed early; 1× Norwegian "glad you were open on 17 May" read as closed |
| 5 | "A range like 10–17 is usually just what Google showed". New answer `opened_late`. Times in the answer: `opened_at`, `closed_at`, `arrived_at` | The hours Google showed were taken as a closing time. A time can mean four things (what Google showed, closing, opening, arrival), and a clue can only turn "closed early" into hours if it knows which. Without `opened_late`, "still closed at 9" would read as closed all day | 219/300, much worse. The model invented times (`arrived_at: 14:00` where the review gives none, Google's "15–1" as a closing time) and then answered closed_early: 75 reviews where it was closed all day |
| 6 | Split into two questions: the short one from version 4 (+ the Google-range line and `opened_late`), and a second one asking for the times, only for closed_early and opened_late reviews | Asking for extra details in the same question changed the main answer. A separate, narrow question can't, and only goes to reviews that have times | 271/300. "The place was dark" read as closed early 24 times (the Google-range line made it worse, not better); "Map said open. It wasn't." read as closed for good; an arrival time given as the closing time |
| 7 | Google-range line removed. "closed" described the way customers write it ("the doors were shut", "the place was dark", "it wasn't open"). Time question names the arrival case | The model didn't lack a rule but knowledge of how people describe a closed business; version 2 had these phrases and got the dark-place reviews right | 287/300. Dark-place and "it wasn't open" fixed, but "Kiva että olitte auki" (glad you were open) now read as closed 7×, and the time question copied the example's "16:20" into reviews with no time |
| — | **Model check** on a fairer test: one review for each of the 162 wordings in the data, same prompt | Every fix flipped answers somewhere else, a sign the model was at its limit | Mistral-Nemo 124/162 (reads "now only open Mon–Fri 8–16" as closed early), **Mistral-Small 24B 156/162**, Gemma-3 refused (gated). Mistral-Small is also cheaper per input token, so we switched. Translating to English first wouldn't save money: most tokens are our instructions, not the review |
| 8 | Example without a number in the time question. "Google said 9–17, but it was closed" added to how customers describe closed. "For good" means not just for a season | Examples get copied, so no values in them. The other two were Mistral-Small's only repeated mistakes | Mistral-Small 160/162: two single odd mistakes, no pattern. But on real batches 252/258: all 6 mistakes "Kiva että olitte auki" (glad you were open) read as closed |
| 9 | The model writes the review in English first, then answers (`in_english`) | Adding phrase after phrase doesn't generalise: the next wording would fail again. Making the model commit to the meaning first does, and shows *why* it fails | Still wrong, but now visible: Mistral-Small translated "Kiva että olitte auki" as "I wish you had been open". The prompt was fine; the model's Finnish was the limit |
| — | **Reading model by country.** Finnish businesses (Finnish and English reviews): Qwen2.5-72B. Swedish and Norwegian businesses: Mistral-Small | Qwen2.5-72B read all 13 of Mistral-Small's mistakes right. Poro-2 8B (a Finnish model) was "at capacity" on Featherless for minutes, too unreliable. Mistral-Small reads Swedish and Norwegian well and is cheaper and faster | First 193 reviews: all right |
