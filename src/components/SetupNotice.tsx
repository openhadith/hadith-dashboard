import { c } from '@/lib/tokens';

/**
 * Shown when the demo database is missing or unseeded.
 *
 * A blank screen at demo time is the worst possible failure, so the studio
 * states plainly what to run instead of throwing.
 */
export default function SetupNotice({ error }: { error?: string }) {
  return (
    <div style={{ padding: 28, overflowY: 'auto' }}>
      <div
        style={{
          maxWidth: 680, background: c.raised, border: `1px solid ${c.lineCard}`,
          borderRadius: 12, padding: '22px 24px',
        }}
      >
        <h1 style={{ margin: '0 0 6px', fontSize: 18.5, fontWeight: 700, color: c.ink }}>
          داتابەیسی نموونە ئامادە نییە
        </h1>
        <p style={{ margin: '0 0 18px', fontSize: 16, lineHeight: 1.9, color: c.inkMuted }}>
          وۆرک‌ستەیشن داتای حەدیس لە <b>api.openhadith.org</b> دەخوێنێتەوە، بەڵام دۆخی
          کار (ڕیزی پەسەندکردن، تیمەکان، تۆماری کردار) لە داتابەیسێکی جیاوازی ناوخۆیی
          هەڵدەگیرێت. بۆ دروستکردنی، ئەمانە جێبەجێ بکە:
        </p>

        <pre
          dir="ltr"
          style={{
            margin: 0, padding: '14px 16px', borderRadius: 9, background: c.sunken,
            border: `1px solid ${c.line}`, fontSize: 16, lineHeight: 1.9,
            fontFamily: 'var(--font-mono, ui-monospace), monospace', color: c.inkMuted,
            overflowX: 'auto',
          }}
        >
{`npm run db:setup`}
        </pre>

        {error && (
          <p
            dir="ltr"
            style={{
              marginTop: 16, marginBottom: 0, padding: '10px 12px', borderRadius: 8,
              background: c.rustSoft, color: c.rust, fontSize: 15, lineHeight: 1.7,
              fontFamily: 'var(--font-mono, ui-monospace), monospace',
            }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
