"""Tests language models on 25 hand-labelled reviews before a full run. Run it after changing the prompt.

    python3 apps/predictor/try_models.py

Answers are cached like everything else, so running it again costs nothing.
"""

import time

import ai
from review_reading import what_customer_found

MODELS = [
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-14B-Instruct",
    "mistralai/Mistral-Nemo-Instruct-2407",
]

# Real reviews from the data, with what the customer really found.
TEST_REVIEWS = [
    ("Ajettiin varta vasten pitkänäperjantaina, ja paikka oli pimeänä. Googlessa aukioloajat 10–17.", "closed"),
    ("Netissä luki auki 7.30–18, mutta jouluaattona oli suljettu. Turha reissu.", "closed"),
    ("Pitkänäperjantaina kiinni vaikka kaikkialla netissä luki auki. Tarkistakaa tiedot.", "closed"),
    ("Kartta väitti että olette auki kiirastorstaina. Ei ollut.", "closed"),
    ("Aukioloajat olivat väärin pitkänäperjantaina. Seisottiin suljetun oven takana.", "closed"),
    ("Det stod öppet 6–22 på nätet men det var stängt på långfredagen. Onödig resa.", "closed"),
    ("Vi kom hit på Black Friday men det var stängt, trots att Google sa öppet. Uppdatera era öppettider!", "closed"),
    ("Synd, stängt på juldagen. Uppdatera gärna helgtiderna.", "closed"),
    ("Vi kom hit på nyttårsaften, men det var stengt selv om Google sa at det var åpent. Oppdater åpningstidene!", "closed"),
    ("Map said open on Good Friday. It wasn't.", "closed"),
    ("Online it said open 09:00–17:00, but it was closed on Christmas Day. Wasted trip.", "closed"),
    ("Helatorstaina suljettiin jo klo 16, vaikka netissä luki 9–19.", "closed_early"),
    ("Tultiin kiirastorstaina klo 16.20 ja ovet olivat jo kiinni. Netissä oli eri ajat.", "closed_early"),
    ("I mellandagarna stängde de redan 20 fast det stod 6–22 på nätet.", "closed_early"),
    ("Skjærtorsdag stengte de allerede 16 selv om det sto 10–18 på nett.", "closed_early"),
    ("Closed already at 16:00 on the holiday although online it said 11:00–18:00.", "closed_early"),
    ("Kiva että olitte auki uudenvuodenpäivänä!", "open"),
    ("Skönt att ni hade öppet på nyårsdagen!", "open"),
    ("Fint at dere hadde åpent første nyttårsdag!", "open"),
    ("Great that you were open on Epiphany!", "open"),
    ("Tämä on suljettu pysyvästi, älkää tulko turhaan.", "permanently_closed"),
    ("Stället har stängt för gott, lokalen är tom.", "permanently_closed"),
    ("Stengt for godt dessverre.", "permanently_closed"),
    ("Aukioloajat ovat muuttuneet, netissä on vanhat tiedot.", "unknown"),
    ("Öppettiderna har ändrats, nätet visar gamla tider.", "unknown"),
]


def main():
    for model in MODELS:
        tokens_before = ai.tokens_used
        started = time.time()

        mistakes = []
        for review, expected in TEST_REVIEWS:
            answer = what_customer_found(review, model)
            if answer != expected:
                mistakes.append(f"    said {answer}, should be {expected}: {review}")

        right = len(TEST_REVIEWS) - len(mistakes)
        print(f"{model}: {right}/{len(TEST_REVIEWS)} right, {ai.tokens_used - tokens_before} new tokens, {time.time() - started:.0f} s")
        for mistake in mistakes:
            print(mistake)


if __name__ == "__main__":
    main()
