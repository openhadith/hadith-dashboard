/**
 * Studio design tokens.
 *
 * Taken from the ui-design comps rather than from the public site's palette.
 * The two are cousins — same emerald/gold/paper family — but the studio runs a
 * warmer, denser scale because it is a workstation: long sessions, small type,
 * many rows on screen at once. Keeping them as separate scales is deliberate;
 * the public site should stay airy.
 *
 * Values are plain hex rather than Tailwind tokens so the studio can be lifted
 * out of this app later without dragging the public theme along.
 */

export const c = {
  // surfaces, lightest to deepest
  raised: '#fffdf8',
  bar: '#f6f4ee',
  nav: '#f1eee6',
  sunken: '#f2efe7',
  page: '#e7e3da',

  // hairlines
  line: '#e6e1d4',
  lineSoft: '#f0ebde',
  lineStrong: '#d8d2c5',
  lineNav: '#ddd7ca',
  lineCard: '#e2ddd0',

  // ink
  ink: '#2b2925',
  inkStrong: '#221f1a',
  inkMuted: '#5c564a',
  inkBody: '#6b6659',
  inkFaint: '#8a8272',
  inkDim: '#948d7d',
  inkGhost: '#a89f8c',
  inkPale: '#b9b1a0',

  // accents
  emerald: '#2f6f5b',
  emeraldDeep: '#235445',
  emeraldSoft: '#e4efe9',
  emeraldTint: '#e9f2ec',
  gold: '#c79a3a',
  goldFg: '#a8792a',
  goldSoft: '#f6ecd2',
  goldTint: '#fbf3e0',
  blue: '#3f6392',
  blueSoft: '#eef2f8',
  rust: '#a8412a',
  rustMid: '#b5563f',
  rustSoft: '#f7ece9',
  plum: '#6b4f86',
  plumSoft: '#e4dcec',
  neutral: '#efece3',
} as const;

/** Avatar chip palette, keyed by studio_users.avatar_tone. */
export const AVATAR: Record<string, { bg: string; fg: string }> = {
  g: { bg: '#d5e5db', fg: '#356b52' },
  a: { bg: '#e7dcc8', fg: '#7a6338' },
  b: { bg: '#d8e0ec', fg: '#3f5170' },
  p: { bg: '#e4dcec', fg: '#6b4f86' },
  r: { bg: '#ecd6d0', fg: '#8a4433' },
};

export function avatarOf(tone: string | null | undefined) {
  return AVATAR[tone ?? 'g'] ?? AVATAR.g;
}

/** Two-letter chip from a Kurdish/Arabic display name, e.g. "م. زانا" -> "م.ز". */
export function initials(name: string | null | undefined) {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0].replace('.', '')}.${parts[1][0]}`;
}

// ------------------------------------------------------------------ workflow

export interface Token { label: string; bg: string; fg: string; dot: string }

export const STATUS: Record<string, Token> = {
  pending:   { label: 'چاوەڕوانی',         bg: c.goldTint,    fg: c.goldFg,   dot: '#d0982f' },
  discuss:   { label: 'پێویستی گفتوگۆ',    bg: c.blueSoft,    fg: c.blue,     dot: c.blue },
  research:  { label: 'پێویستی لێکۆڵینەوە', bg: c.neutral,     fg: c.inkFaint, dot: c.inkFaint },
  conflict:  { label: 'ناکۆک',             bg: c.rustSoft,    fg: c.rust,     dot: c.rustMid },
  duplicate: { label: 'دووبارە',           bg: c.goldTint,    fg: c.goldFg,   dot: '#d0982f' },
  approved:  { label: 'پەسەندکراو',        bg: c.emeraldTint, fg: c.emerald,  dot: c.emerald },
  rejected:  { label: 'ڕەتکراوە',          bg: c.rustSoft,    fg: c.rust,     dot: c.rust },
  published: { label: 'بڵاوکراوە',         bg: c.emeraldTint, fg: c.emeraldDeep, dot: c.emeraldDeep },
};

/** Issue badges. Same source table as Data Quality, two readings of it. */
export const ISSUE: Record<string, Token> = {
  sanad:    { label: 'شکاوی سەنەد',   bg: c.rustSoft, fg: c.rust,     dot: c.rust },
  dup:      { label: 'دووبارە',        bg: c.goldTint, fg: c.goldFg,   dot: c.gold },
  ref:      { label: 'سەرچاوە کەم',   bg: c.blueSoft, fg: c.blue,     dot: c.blue },
  unknown:  { label: 'ڕاوی نەناسراو', bg: c.neutral,  fg: c.inkBody,  dot: c.inkFaint },
  conflict: { label: 'ناکۆکی سەرچاوە', bg: c.rustSoft, fg: c.rust,     dot: c.rustMid },
};

/**
 * Grade chips.
 *
 * In this MVP grades on queue rows are demo metadata (snapshot.gradeSource ===
 * 'demo'), not rulings from the corpus — the studio labels them as such. Real
 * hukm text, where it exists, comes from the live API's `hukmText`.
 */
export const GRADE: Record<string, Token> = {
  sahih:   { label: 'صحیح', bg: c.emeraldTint, fg: c.emerald,  dot: c.emerald },
  hasan:   { label: 'حسن',  bg: c.goldTint,    fg: c.goldFg,   dot: c.gold },
  daif:    { label: 'ضعیف', bg: c.rustSoft,    fg: c.rust,     dot: c.rust },
  unknown: { label: '؟',    bg: c.neutral,     fg: c.inkFaint, dot: c.inkPale },
};

export const ROLE_LABEL: Record<string, string> = {
  supervisor: 'سەرپەرشتیار',
  muhaqqiq: 'موحەققیق',
  editor: 'دەستکار',
  reviewer: 'پێداچووەوە',
  viewer: 'بینەر',
};

/** A member's role *within a team*, distinct from their global studio role. */
export const TEAM_ROLE_LABEL: Record<string, string> = {
  lead: 'سەرۆکی تیم',
  verifier: 'پشتڕاستکەرەوە',
  editor: 'دەستکار',
  reviewer: 'پێداچووەوە',
  viewer: 'بینەر',
};

export const PERMISSION_LABEL: Record<string, string> = {
  view: 'بینین',
  edit: 'دەستکاری',
  approve: 'پەسەند',
  reject: 'ڕەتکردن',
  merge: 'یەکخستن',
  admin: 'بەڕێوەبردن',
};

export const PERMISSIONS = ['view', 'edit', 'approve', 'reject', 'merge', 'admin'] as const;

// ------------------------------------------------------------------ numerals

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

/** 312 -> ٣١٢. The comps set every number in Arabic-Indic digits. */
export function toAr(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return String(n).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

/** Relative time in Kurdish, matching the comps' "٥ خ" / "٢ ڕ" shorthand. */
export function agoKu(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'ئێستا';
  if (mins < 60) return `${toAr(mins)} خ`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${toAr(hours)} ک`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'دوێنێ';
  if (days < 30) return `${toAr(days)} ڕ`;
  return `${toAr(Math.round(days / 30))} م`;
}

/** Kurdish (Sorani) weekday names, indexed by `Date.getDay()`. */
const KU_DAYS = ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە'];

/**
 * Today, as the comps show it: Kurdish weekday plus the Hijri date.
 *
 * `Intl` has no Kurdish locale, so the weekday is looked up directly rather
 * than left to fall back to English. The Hijri part uses the Umm al-Qura
 * calendar through the Arabic locale, which is what a hadith editor expects to
 * see; if the runtime lacks that calendar the Gregorian day is dropped rather
 * than shown in the wrong system.
 */
export function todayLabel(d = new Date()): string {
  const weekday = KU_DAYS[d.getDay()];
  try {
    const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(d);
    return `${weekday} · ${hijri}`;
  } catch {
    return weekday;
  }
}

/**
 * Shell surfaces.
 *
 * The application frame follows the house dashboard language: a dark fixed
 * rail, a sticky white header, an edge-to-edge working surface, and cards
 * defined by a hairline and a near-invisible shadow rather than by a grey
 * page behind them. The brand hues above are unchanged — only the furniture
 * is new.
 */
export const shell = {
  /** Rail: near-black with a green cast, so it sits under the brand. */
  railTop: '#17211d',
  railBottom: '#121a17',
  railBorder: '#24302b',
  railText: 'rgba(255,255,255,.52)',
  railTextHover: 'rgba(255,255,255,.82)',
  railHover: 'rgba(255,255,255,.04)',
  railActive: 'rgba(255,255,255,.06)',
  railGroup: 'rgba(255,255,255,.36)',
  /** The active row's thumb — gold, as the comps use for emphasis. */
  railAccent: '#c79a3a',

  headerBg: '#ffffff',
  /** Working surface: a warm white, one shade off the card white. */
  canvas: '#fffdf9',
  card: '#ffffff',
  cardBorder: '#efeae0',
  cardBorderSoft: '#f5f2ec',
  /** A quiet secondary surface for rails and toolbars inside a page. */
  sunken: '#faf8f3',

  shadowSm: '0 1px 3px rgba(35, 30, 20, .05)',
  shadowMd: '0 2px 10px rgba(35, 30, 20, .08)',
} as const;
