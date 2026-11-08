// The copilot's guides (src/guides/*.md): how the product works, written by the team. The model finds them with the
// search_guides tool and reads one with read_guide. They are the only reference text it gets: no web search.
//
// Each file starts with front matter:
//   ---
//   id: suggestions
//   title: Suggestions for special days
//   tags: holiday, predictor, approve
//   ---
// then a short summary paragraph and `## ` sections.

export type GuideSection = { heading: string; body: string };
export type Guide = { id: string; title: string; tags: string[]; summary: string; sections: GuideSection[] };
export type GuideHit = { guide: string; title: string; section: string; excerpt: string; score: number };

export function parseGuide(markdown: string): Guide | null {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(markdown.replace(/\r\n?/g, '\n').trim());
  if (!match) return null;
  const meta = Object.fromEntries(
    match[1]!.split('\n').flatMap((line) => {
      const i = line.indexOf(':');
      return i > 0 ? [[line.slice(0, i).trim(), line.slice(i + 1).trim()]] : [];
    }),
  ) as Record<string, string>;
  if (!meta.id || !meta.title) return null;
  const [intro = '', ...parts] = match[2]!.split(/^## /m);
  return {
    id: meta.id,
    title: meta.title,
    tags: (meta.tags ?? '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    summary: intro.replace(/^# .*\n/, '').trim(),
    sections: parts.map((part) => {
      const [heading = '', ...body] = part.split('\n');
      return { heading: heading.trim(), body: body.join('\n').trim() };
    }),
  };
}

const STOPWORDS = new Set(
  'the and for are but not you your yours with what when where which who how why can does did has have this that from into about there their them they was were will would should could our out all any its just then than also get got here been being too very more most some such only own same off over under again once do is it in on of to a an be by or as at if so my me we us i'.split(
    ' ',
  ),
);

/** Lowercase words without accents, so "pyhäpäivä" matches "pyhapaiva" and "Opening" matches "opening". */
export function terms(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      // A crude stem, enough for "suggestions"/"suggested"/"suggest".
      .map((w) => w.replace(/(ings|ing|ions|ion|ed|es|s)$/, '') || w)
  );
}

const count = (haystack: string[], needle: string) => haystack.filter((w) => w === needle).length;

/** The best-matching sections across the guides, best first. */
export function searchGuides(guides: Guide[], query: string, limit = 4, excerptChars = 700): GuideHit[] {
  const wanted = [...new Set(terms(query))];
  if (!wanted.length) return [];
  const hits: GuideHit[] = [];
  for (const guide of guides) {
    const title = terms(guide.title);
    const tags = guide.tags.flatMap(terms);
    const sections = [{ heading: 'Overview', body: guide.summary }, ...guide.sections];
    for (const section of sections) {
      const heading = terms(section.heading);
      const body = terms(section.body);
      let score = 0;
      for (const w of wanted) {
        score +=
          Math.min(count(body, w), 4) + 2 * count(heading, w) + 3 * count(title, w) + 3 * count(tags, w);
      }
      // A section that covers more of the question's words beats one that repeats one of them.
      const covered = wanted.filter(
        (w) => body.includes(w) || heading.includes(w) || title.includes(w),
      ).length;
      score *= 0.5 + covered / wanted.length;
      if (score > 0) {
        const text = section.body.replace(/\s+/g, ' ').trim();
        hits.push({
          guide: guide.id,
          title: guide.title,
          section: section.heading,
          excerpt: text.length > excerptChars ? `${text.slice(0, excerptChars - 1)}…` : text,
          score: Math.round(score * 100) / 100,
        });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** A guide as text for the model, at most `max` characters. */
export function guideText(guide: Guide, max = 4_000): string {
  const text = [
    `# ${guide.title}`,
    guide.summary,
    ...guide.sections.map((s) => `## ${s.heading}\n${s.body}`),
  ].join('\n\n');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
