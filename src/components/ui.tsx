'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { toAr } from '@/lib/tokens';

/**
 * The page furniture every screen is built from.
 *
 * Deliberately plain elements over CSS classes declared in `globals.css`
 * rather than AntD components: the shell's shapes (page head, hairline card,
 * stat tile) are house style, and expressing them as classes keeps one place
 * to change a radius or a shadow. AntD still supplies everything inside them —
 * tables, forms, modals.
 */

export function PageHead({
  title, sub, actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/**
 * A labelled band of cards.
 *
 * A dashboard screen carries several unrelated things at once; without a break
 * between them the page is one long stack and nothing signals where one subject
 * ends and the next begins. The rule after the label runs to the end of the row
 * so it reads as a heading rather than as loose text.
 */
export function Section({
  title, action, children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      {(title || action) && (
        <div className="section-head">
          {title && <h2 className="section-title">{title}</h2>}
          {action && <div className="section-action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Two cards side by side, stacking when the surface runs out of room. */
export function Split({ children }: { children: ReactNode }) {
  return <div className="split">{children}</div>;
}

export function Card({
  title, extra, children, pad = true, style, bodyStyle,
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  /** Off for tables and lists that should sit edge to edge. */
  pad?: boolean;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}) {
  return (
    <section className="card" style={style}>
      {title && (
        <header className="card-head">
          <h2 className="card-title">{title}</h2>
          {extra && <div className="card-extra">{extra}</div>}
        </header>
      )}
      <div className={pad ? 'card-pad' : undefined} style={bodyStyle}>
        {children}
      </div>
    </section>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}

export function StatTile({
  label, value, icon, iconBg, iconColor, href, delta, deltaTitle, hint,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  href?: string;
  /** Percentage change; the arrow and colour follow its sign. */
  delta?: { pct: number; good: boolean } | null;
  deltaTitle?: string;
  /** One quiet line under the number, for what the number does not say. */
  hint?: ReactNode;
}) {
  const body = (
    <>
      <div className="stat-tile-head">
        <div style={{ minWidth: 0 }}>
          <div className="stat-tile-label">{label}</div>
          <div className="stat-tile-value">{value}</div>
          {delta && (
            <span
              className={`stat-tile-trend ${delta.pct === 0 ? 'flat' : delta.good ? 'up' : 'down'}`}
              title={deltaTitle}
            >
              {delta.pct > 0 ? <ArrowUpOutlined /> : delta.pct < 0 ? <ArrowDownOutlined /> : null}
              {toAr(Math.abs(delta.pct))}٪
            </span>
          )}
          {hint && <div className="stat-tile-hint">{hint}</div>}
        </div>
        <div className="stat-tile-icon" style={{ background: iconBg, color: iconColor }}>
          {icon}
        </div>
      </div>
    </>
  );

  return href ? (
    <Link href={href} className="stat-tile plain">{body}</Link>
  ) : (
    <div className="stat-tile">{body}</div>
  );
}

/** Arabic text — matn, narrator names — in Amiri. */
export function Matn({
  children, size = 15, clamp, style,
}: {
  children: ReactNode;
  size?: number;
  clamp?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      dir="rtl"
      className={`matn${clamp ? ' clamp-1' : ''}`}
      style={{ fontSize: size, ...style }}
    >
      {children}
    </span>
  );
}
