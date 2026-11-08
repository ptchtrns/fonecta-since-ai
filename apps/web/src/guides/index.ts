// The copilot's guides, bundled at build time. Add a guide by adding a Markdown file here (see lib/copilot/guides.ts).
import { parseGuide, type Guide } from '~/lib/copilot/guides';

const files = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

export const guides: Guide[] = Object.values(files)
  .map(parseGuide)
  .filter((g): g is Guide => g !== null)
  .sort((a, b) => a.id.localeCompare(b.id));

export const findGuide = (id: string) => guides.find((g) => g.id === id) ?? null;
