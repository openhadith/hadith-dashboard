/**
 * Read-only access to the published corpus.
 *
 * The studio never writes here. Content lives behind the public API and is
 * fetched over HTTP exactly as the public site fetches it, which keeps one
 * source of truth for matn, isnad and book metadata — and means the studio
 * shows precisely what a reader would see.
 */

import { API } from './backend';

export interface NarratorBio {
  id: string;
  name: string;
  shohra?: string | null;
  kunya?: string | null;
  laqab?: string | null;
  nasab?: string | null;
  mazhab?: string | null;
  rutba?: number | null;
  rutba_description?: string | null;
  tabaqah?: number | null;
  tadlis?: boolean;
  has_ikhtilat?: boolean;
  birth_country?: string | null;
  death_country?: string | null;
  deathdate?: string | null;
}

export interface ChainLink {
  id: string;
  rawyId: string;
  toldById: string | null;
  sanadId: string | null;
  rawy: {
    Name: string;
    Shohra?: string | null;
    Rotba?: string | null;
    DeathYear?: string | null;
    bio?: NarratorBio | null;
  };
}

export interface AssessmentBranch {
  sanadId: string;
  referenceId: string | null;
  hadithNumber: number | null;
  pageNumber: number | null;
  hukmName: string | null;
  distinctNarrators: Array<{ id: string; name: string; shohra?: string | null }>;
}

export interface Assessment {
  index: number;
  sharh: string | null;
  grades: string[];
  branches: AssessmentBranch[];
}

export interface CorpusHadith {
  id: string;
  matn?: string | null;
  clean_matn?: string | null;
  full_hadith?: string | null;
  type?: string | null;
  ehala?: string | null;
  bookid?: string | number | null;
  hadithid?: number | null;
  pageNo?: number | null;
  hukmText?: string | null;
  book?: { id: string; title: string; publisher?: string | null; century?: string | null } | null;
  authors?: { name?: string | null } | null;
  hadith_has_rawy?: ChainLink[];
  assessments?: Assessment[];
  explanations?: Array<Record<string, string | null>>;
}

async function get<T>(path: string): Promise<T | null> {
  try {
    // Uncached: after a publish the workstation must show what is live now.
    const res = await fetch(`${API}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return (body.data ?? null) as T;
  } catch {
    // The studio must survive the public API being unreachable — screens fall
    // back to the workflow data they already hold.
    return null;
  }
}

export const getHadith = (id: string) => get<CorpusHadith>(`/hadiths/${id}`);

export const getNarrator = (id: string) =>
  get<Record<string, unknown>>(`/narrators/${id}`);

export const searchCorpus = (q: string) =>
  get<{ hadiths: unknown[]; narrators: unknown[]; books: unknown[] }>(
    `/search?q=${encodeURIComponent(q)}`,
  );

/**
 * Orders `hadith_has_rawy` into a chain, Prophet-ward first.
 *
 * The API returns links as (narrator, told_by) pairs without a sequence, so the
 * order is recovered by walking the told_by graph: a link whose narrator is
 * nobody else's told_by is the collector's end of the chain.
 */
export function orderChain(links: ChainLink[]): ChainLink[] {
  if (!links.length) return [];
  const byNarrator = new Map(links.map((l) => [l.rawyId, l]));
  const isToldBy = new Set(links.map((l) => l.toldById).filter(Boolean) as string[]);

  // Start from whichever narrator nobody cites as their source.
  const head = links.find((l) => !isToldBy.has(l.rawyId)) ?? links[0];

  const out: ChainLink[] = [];
  const seen = new Set<string>();
  let cur: ChainLink | undefined = head;
  while (cur && !seen.has(cur.rawyId)) {
    seen.add(cur.rawyId);
    out.push(cur);
    cur = cur.toldById ? byNarrator.get(cur.toldById) : undefined;
  }

  // Anything the walk missed (parallel branches) is appended so nothing is lost.
  for (const l of links) if (!seen.has(l.rawyId)) out.push(l);
  return out;
}

/**
 * Maps the corpus's hukm keys onto the studio's grade tokens.
 *
 * The keys are romanised Arabic using digit substitutions — `Sa7ee7` (صحيح),
 * `ShadeedElDa3f` (شديد الضعف), `Motaham` (متهم) — so matching is done on a
 * normalised form where 7→h, 3→a, 2→a. Anything unrecognised stays 'unknown'
 * rather than being guessed at: a wrong grade badge on a hadith is worse than
 * an honest question mark.
 */
export function gradeKeyOf(hukm: string | null | undefined): string {
  if (!hukm) return 'unknown';
  const h = hukm.toLowerCase().replace(/7/g, 'h').replace(/3/g, 'a').replace(/2/g, 'a');

  // Order matters: "shadeed el daaf" must not be read as merely "daaf",
  // and "hasan li ghayrih" is still hasan.
  if (/mawdoo|maw'?do|kazzab|matrook|motaham|munkar/.test(h)) return 'daif';
  if (/shadeed/.test(h)) return 'daif';
  if (/daaf|daeef|daif|daef/.test(h)) return 'daif';
  if (/hasan/.test(h)) return 'hasan';
  if (/sahee|sahih|sahi/.test(h)) return 'sahih';
  return 'unknown';
}

/** Human-readable Arabic label for a raw hukm key, for tooltips. */
export function hukmLabel(hukm: string | null | undefined): string | null {
  if (!hukm) return null;
  const MAP: Record<string, string> = {
    sa7ee7: 'صحيح',
    hasan: 'حسن',
    da3ef: 'ضعيف',
    da3f: 'ضعيف',
    shadeedelda3f: 'شديد الضعف',
    motaham: 'متهم',
    matrook: 'متروك',
    mawdoo3: 'موضوع',
    munkar: 'منكر',
  };
  return MAP[hukm.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? hukm;
}
