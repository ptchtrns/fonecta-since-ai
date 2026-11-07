// What Connect says to owners on WhatsApp, in their language: one suggestion per message, the reason in plain words,
// and the answer one tap away.
import type { Language } from '~/db/schema';
import { formatHours, toIntervals } from '~/lib/hours';

type ReasonCopy = {
  ownHistory: string;
  peersClose: (share: string) => string;
  typeClosed: (share: string) => string;
  mall: (name: string) => string;
  seasonal: string;
  ownSeasonal: string;
  doorsClosed: string;
  closedAt: (time: string) => string;
  closedUntil: (time: string) => string;
  foundOpen: string;
  googleUser: (date: string) => string;
  snow: string;
};

type Copy = {
  hi: (name: string) => string;
  closed: string;
  dayIs: (name: string, day: string) => string;
  googleShows: (hours: string) => string;
  weSuggest: (day: string, hours: string) => string;
  edit: (url: string) => string;
  buttons: { approve: string; edit: string; reject: string };
  done: (hours: string) => string;
  liveNow: (sites: string) => string;
  liveSoon: (sites: string, when: string) => string;
  savedOnly: string;
  declined: string;
  answered: string;
  useButtons: string;
  standing: (business: string, days: string) => string;
  schoolBreak: string;
  weekdays: string[];
  reasons: ReasonCopy;
};

const copy: Record<Language, Copy> = {
  fi: {
    hi: (name) => `Hei ${name}!`,
    closed: 'suljettu',
    dayIs: (name, day) => `${name} on ${day}`,
    googleShows: (hours) => `Google näyttää nyt ${hours}.`,
    weSuggest: (day, hours) => `Ehdotamme: *${day} ${hours}*`,
    edit: (url) => `Muokkaa tai katso perustelut: ${url}`,
    buttons: { approve: 'Hyväksy', edit: 'Muokkaa', reject: 'Ei kiitos' },
    done: (hours) => `Valmista! ${hours} on päivitetty.`,
    liveNow: (sites) => `Näkyy nyt: ${sites}.`,
    liveSoon: (sites, when) => `${sites}: ${when} kuluessa.`,
    savedOnly: 'Tallensimme muutoksen.',
    declined: 'Selvä, jätämme ajat ennalleen emmekä kysy tästä päivästä uudelleen.',
    answered: 'Tähän on jo vastattu, kiitos!',
    useButtons: 'Vastaa napeilla tai avaa viestin linkki.',
    standing: (business, days) =>
      `Sopimuksemme mukaisesti päivitimme yrityksen ${business} aukioloajat: ${days}.`,
    schoolBreak: 'Koululoma',
    weekdays: ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'],
    reasons: {
      ownHistory: 'Perustuu aiempina vuosina tälle päivälle antamiisi aikoihin.',
      peersClose: (share) =>
        `${share} samanlaisista lähialueen yrityksistä kertoo olevansa kiinni tänä päivänä.`,
      typeClosed: (share) =>
        `${share} kaltaisistasi yrityksistä on ollut kiinni tänä päivänä aiempina vuosina.`,
      mall: (name) => `${name} on julkaissut tämän päivän aukioloajat.`,
      seasonal: 'Kaltaisesi yritykset ovat kiinni tähän aikaan vuodesta.',
      ownSeasonal: 'Olet aiempina vuosina ollut kiinni tähän aikaan vuodesta.',
      doorsClosed: 'Asiakas löysi ovesi suljettuina tänä päivänä viime vuonna.',
      closedAt: (time) => `Asiakas löysi ovesi jo suljettuina klo ${time} tänä päivänä viime vuonna.`,
      closedUntil: (time) => `Asiakas löysi ovesi suljettuina klo ${time} asti tänä päivänä viime vuonna.`,
      foundOpen: 'Asiakas löysi sinut avoinna tänä päivänä viime vuonna.',
      googleUser: (date) => `Google-käyttäjä ilmoitti nämä ajat päivälle ${date}.`,
      snow: 'Lunta ei todennäköisesti ole tarpeeksi hiihtämiseen tänä päivänä.',
    },
  },
  sv: {
    hi: (name) => `Hej ${name}!`,
    closed: 'stängt',
    dayIs: (name, day) => `${name} är ${day}`,
    googleShows: (hours) => `Google visar nu ${hours}.`,
    weSuggest: (day, hours) => `Vi föreslår: *${day} ${hours}*`,
    edit: (url) => `Ändra eller se varför: ${url}`,
    buttons: { approve: 'Godkänn', edit: 'Ändra', reject: 'Nej tack' },
    done: (hours) => `Klart! ${hours} är uppdaterat.`,
    liveNow: (sites) => `Syns nu på ${sites}.`,
    liveSoon: (sites, when) => `${sites}: inom ${when}.`,
    savedOnly: 'Vi har sparat ändringen.',
    declined: 'Okej, vi låter tiderna vara och frågar inte om den här dagen igen.',
    answered: 'Det här är redan besvarat, tack!',
    useButtons: 'Svara med knapparna eller öppna länken i meddelandet.',
    standing: (business, days) => `Som avtalat har vi uppdaterat öppettiderna för ${business}: ${days}.`,
    schoolBreak: 'Skollov',
    weekdays: ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön'],
    reasons: {
      ownHistory: 'Baserat på vad du angav för den här dagen tidigare år.',
      peersClose: (share) => `${share} av liknande företag i närheten säger att de har stängt den här dagen.`,
      typeClosed: (share) => `${share} av företag som ditt hade stängt den här dagen tidigare år.`,
      mall: (name) => `${name} har publicerat sina öppettider för den här dagen.`,
      seasonal: 'Företag som ditt har stängt den här tiden på året.',
      ownSeasonal: 'Du har haft stängt den här tiden på året tidigare år.',
      doorsClosed: 'En kund fann dörren stängd den här dagen i fjol.',
      closedAt: (time) => `En kund fann dörren redan stängd kl. ${time} den här dagen i fjol.`,
      closedUntil: (time) => `En kund fann dörren stängd fram till kl. ${time} den här dagen i fjol.`,
      foundOpen: 'En kund fann er öppna den här dagen i fjol.',
      googleUser: (date) => `En Google-användare rapporterade de här tiderna för ${date}.`,
      snow: 'Det blir troligen inte tillräckligt med snö för skidåkning den här dagen.',
    },
  },
  nb: {
    hi: (name) => `Hei ${name}!`,
    closed: 'stengt',
    dayIs: (name, day) => `${name} er ${day}`,
    googleShows: (hours) => `Google viser nå ${hours}.`,
    weSuggest: (day, hours) => `Vi foreslår: *${day} ${hours}*`,
    edit: (url) => `Endre eller se hvorfor: ${url}`,
    buttons: { approve: 'Godkjenn', edit: 'Endre', reject: 'Nei takk' },
    done: (hours) => `Ferdig! ${hours} er oppdatert.`,
    liveNow: (sites) => `Vises nå på ${sites}.`,
    liveSoon: (sites, when) => `${sites}: innen ${when}.`,
    savedOnly: 'Vi har lagret endringen.',
    declined: 'Greit, vi lar tidene være og spør ikke om denne dagen igjen.',
    answered: 'Dette er allerede besvart, takk!',
    useButtons: 'Svar med knappene eller åpne lenken i meldingen.',
    standing: (business, days) => `Som avtalt har vi oppdatert åpningstidene for ${business}: ${days}.`,
    schoolBreak: 'Skoleferie',
    weekdays: ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'],
    reasons: {
      ownHistory: 'Basert på det du oppga for denne dagen tidligere år.',
      peersClose: (share) =>
        `${share} av lignende bedrifter i nærheten sier at de holder stengt denne dagen.`,
      typeClosed: (share) => `${share} av bedrifter som din holdt stengt denne dagen tidligere år.`,
      mall: (name) => `${name} har publisert åpningstidene for denne dagen.`,
      seasonal: 'Bedrifter som din holder stengt på denne tiden av året.',
      ownSeasonal: 'Du har holdt stengt på denne tiden av året tidligere år.',
      doorsClosed: 'En kunde fant døren stengt denne dagen i fjor.',
      closedAt: (time) => `En kunde fant døren allerede stengt kl. ${time} denne dagen i fjor.`,
      closedUntil: (time) => `En kunde fant døren stengt frem til kl. ${time} denne dagen i fjor.`,
      foundOpen: 'En kunde fant dere åpne denne dagen i fjor.',
      googleUser: (date) => `En Google-bruker rapporterte disse tidene for ${date}.`,
      snow: 'Det blir trolig ikke nok snø til skikjøring denne dagen.',
    },
  },
  en: {
    hi: (name) => `Hi ${name}!`,
    closed: 'closed',
    dayIs: (name, day) => `${name} is on ${day}`,
    googleShows: (hours) => `Google now shows ${hours}.`,
    weSuggest: (day, hours) => `We suggest: *${day} ${hours}*`,
    edit: (url) => `Edit or see why: ${url}`,
    buttons: { approve: 'Approve', edit: 'Edit', reject: 'No thanks' },
    done: (hours) => `Done! ${hours} is updated.`,
    liveNow: (sites) => `Live now on ${sites}.`,
    liveSoon: (sites, when) => `${sites}: within ${when}.`,
    savedOnly: "We've saved the change.",
    declined: "Got it, we'll leave your hours as they are and won't ask about this day again.",
    answered: 'That one is already answered, thanks!',
    useButtons: 'Please answer with the buttons, or open the link in the message.',
    standing: (business, days) => `As agreed, we've updated the hours for ${business}: ${days}.`,
    schoolBreak: 'School break',
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    reasons: {
      ownHistory: 'Based on what you entered for this day in previous years.',
      peersClose: (share) => `${share} of similar businesses nearby have told us they close on this day.`,
      typeClosed: (share) => `${share} of businesses like yours were closed on this day in earlier years.`,
      mall: (name) => `${name} has published its hours for this day.`,
      seasonal: 'Businesses like yours are closed at this time of year.',
      ownSeasonal: 'You have been closed at this time of year in earlier years.',
      doorsClosed: 'A customer found your doors closed on this day last year.',
      closedAt: (time) => `A customer found you already closed at ${time} on this day last year.`,
      closedUntil: (time) => `A customer found you still closed until ${time} on this day last year.`,
      foundOpen: 'A customer found you open on this day last year.',
      googleUser: (date) => `A Google user reported these hours for ${date}.`,
      snow: 'There is unlikely to be enough snow for skiing on this day.',
    },
  },
};

export const t = (language: Language) => copy[language];

/** The predictor writes its reasons in English. Returns null for a reason this table doesn't know. */
export function translateReason(reason: string, language: Language): string | null {
  const r = copy[language].reasons;
  const match = (pattern: RegExp) => pattern.exec(reason);
  if (reason.startsWith('Based on what you entered')) return r.ownHistory;
  if (reason.startsWith('Businesses like yours are closed')) return r.seasonal;
  if (reason.startsWith('There is unlikely to be enough snow')) return r.snow;
  if (reason.startsWith('A customer found your doors closed')) return r.doorsClosed;
  if (reason.startsWith('A customer found you open')) return r.foundOpen;
  let m;
  if ((m = match(/^(\d+%) of similar businesses/))) return r.peersClose(m[1]!);
  if ((m = match(/^(\d+%) of businesses like yours/))) return r.typeClosed(m[1]!);
  if ((m = match(/^A customer found you already closed at (\S+)/))) return r.closedAt(m[1]!);
  if ((m = match(/^A customer found you still closed until (\S+)/))) return r.closedUntil(m[1]!);
  if ((m = match(/^A Google user reported these hours for (\S+?),/))) return r.googleUser(m[1]!);
  if ((m = match(/^(.+) has published its hours/))) return r.mall(m[1]!);
  if (reason.startsWith('You ')) return r.ownSeasonal;
  return null;
}

/** "to 24.12." in the owner's language. The date's own full stop also ends a sentence. */
export function localDay(date: string, language: Language): string {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = copy[language].weekdays[(day.getUTCDay() + 6) % 7];
  return `${weekday} ${day.getUTCDate()}.${day.getUTCMonth() + 1}.`;
}

/** "10:00–15:00", or the word for closed in the owner's language. */
export function localHours(text: string, language: Language): string {
  return toIntervals(text).length ? formatHours(text) : copy[language].closed;
}

export type SuggestionMessageInput = {
  owner: string;
  dayName: string;
  date: string;
  shown: string;
  suggested: string;
  reasons: string[];
  url: string;
  language: Language;
};

/** The first contact about one suggestion. */
export function suggestionMessage(m: SuggestionMessageInput): string {
  const c = copy[m.language];
  const day = localDay(m.date, m.language);
  const reasons = m.reasons
    .map((reason) => translateReason(reason, m.language))
    .filter((reason): reason is string => !!reason)
    .slice(0, 2);
  return [
    `${c.hi(m.owner)} ${c.dayIs(m.dayName, day)} ${c.googleShows(localHours(m.shown, m.language))}`,
    ...reasons,
    '',
    c.weSuggest(day, localHours(m.suggested, m.language)),
    '',
    c.edit(m.url),
  ].join('\n');
}

type Site = { name: string; seconds: number };

const HOUR = 3600;
const DAY = 24 * HOUR;

/** "within" wording for how long a site takes to show a change. */
export function updateTime(seconds: number): string {
  if (seconds <= HOUR) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < DAY) return `${Math.round(seconds / HOUR)} h`;
  return `${Math.round(seconds / DAY)} d`;
}

/** Confirmation that says where the new hours show, the brief's fifth step. */
export function confirmationMessage(
  hours: string,
  date: string,
  sites: Site[] | null,
  language: Language,
): string {
  const c = copy[language];
  const done = c.done(`${localDay(date, language)} ${localHours(hours, language)}`);
  if (!sites) return `${done} ${c.savedOnly}`;
  const now = sites.filter((s) => s.seconds <= HOUR).map((s) => s.name);
  const later = sites.filter((s) => s.seconds > HOUR);
  const slowest = Math.max(0, ...later.map((s) => s.seconds));
  return [
    done,
    now.length ? c.liveNow(now.join(', ')) : '',
    later.length ? c.liveSoon(later.map((s) => s.name).join(', '), updateTime(slowest)) : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The same fact for the dashboard: "Published to 8 sites. Google (Search & Maps) shows it within 2 min." */
export function publishedSummary(sites: Site[] | null): string {
  if (!sites?.length) return 'Saved. It goes live once publishing to Yext is connected.';
  const first = sites[0]!;
  const count = sites.length === 1 ? '1 site' : `${sites.length} sites`;
  return `Published to ${count}. ${first.name} shows it within ${updateTime(first.seconds)}, the slowest within ${updateTime(sites.at(-1)!.seconds)}.`;
}
