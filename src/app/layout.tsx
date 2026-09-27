import type { Metadata } from 'next';
import { Amiri, Outfit, Vazirmatn } from 'next/font/google';
import './globals.css';
import { StudioProvider } from '@/components/StudioContext';
import AntdProvider from '@/components/AntdProvider';
import StudioChrome from '@/components/StudioChrome';
import { query } from '@/lib/db';

/**
 * Three families, each with a job:
 *
 * - Outfit sets the interface — labels, numbers, buttons. It is Latin-only, so
 *   it is first in the stack and the browser falls back per glyph.
 * - Vazirmatn sets the Kurdish chrome. It is drawn for Persian, so Sorani's
 *   extended letters (ڕ ڵ ێ ۆ ە) are native glyphs rather than additions to an
 *   Arabic-only face, which is why they sit on the baseline properly and keep
 *   their counters open at 13px.
 * - Amiri sets Arabic matn and narrator names, where a serif reads better at
 *   the sizes this content is set in.
 */
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-outfit',
  display: 'swap',
  /*
   * This fallback list is load-bearing, not decoration.
   *
   * Given no `fallback`, next/font appends a metric-matched face of its own and
   * --font-outfit resolves to `"Outfit", "Outfit Fallback"` — where that
   * fallback is `src: local(Arial)`. Arial covers Arabic script, so a Kurdish
   * glyph would be served by Arial and the browser would never reach Vazirmatn
   * further down the stack. Every Kurdish label in the app rendered in Arial
   * because of it.
   *
   * Naming a fallback suppresses the generated one, so the chain stays under
   * our control and hands Arabic script to Vazirmatn. `adjustFontFallback`
   * looks like the obvious switch for this but the Turbopack font loader in
   * Next 16 ignores it — verified by reading the emitted @font-face.
   */
  fallback: ['Vazirmatn', 'Noto Sans Arabic', 'system-ui', 'sans-serif'],
});
const vazir = Vazirmatn({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-vazir',
  display: 'swap',
  fallback: ['Noto Sans Arabic', 'system-ui', 'sans-serif'],
});

const amiri = Amiri({
  subsets: ['arabic'],
  weight: ['400', '700'],
  variable: '--font-amiri',
  display: 'swap',
  fallback: ['Scheherazade New', 'Times New Roman', 'serif'],
});

export const metadata: Metadata = {
  title: 'دەزگای پەسەندکردنی حەدیس',
  description: 'وۆرک‌ستەیشنی پەسەندکردن و بەڕێوەبردنی کۆرپەسی حەدیس',
  robots: { index: false, follow: false },
};

// Workflow state changes on every action; nothing here may be cached.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The chrome owns three things: the queue badge, the smart collections in the
  // sidebar, and the corpus totals in the status bar.
  let pendingCount = 0;
  let collections: Array<{ type: string; count: number }> = [];
  try {
    const [pending, issues] = await Promise.all([
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM studio_review WHERE status = 'pending'`,
      ),
      query<{ type: string; count: string }>(
        `SELECT type, count(*)::text AS count FROM studio_issues
          WHERE resolved_at IS NULL GROUP BY type ORDER BY count(*) DESC`,
      ),
    ]);
    pendingCount = Number(pending[0]?.count ?? 0);
    collections = issues.map((i) => ({ type: i.type, count: Number(i.count) }));
  } catch {
    // A missing database shouldn't blank the app — the setup notice on the
    // dashboard explains what to run.
  }

  const corpus = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/stats`, { next: { revalidate: 300 } })
    .then((r) => r.json())
    .then((b) => b?.data as { hadiths?: number; books?: number; narrators?: number } | undefined)
    .catch(() => undefined);

  return (
    <html
      lang="ckb"
      dir="rtl"
      className={`${outfit.variable} ${vazir.variable} ${amiri.variable}`}
    >
      <body>
        <AntdProvider>
          <StudioProvider>
            <StudioChrome
              pendingCount={pendingCount}
              collections={collections}
              corpus={{
                hadiths: corpus?.hadiths ?? null,
                books: corpus?.books ?? null,
                narrators: corpus?.narrators ?? null,
              }}
            >
              {children}
            </StudioChrome>
          </StudioProvider>
        </AntdProvider>
      </body>
    </html>
  );
}
