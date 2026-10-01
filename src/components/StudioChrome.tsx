'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Avatar, Dropdown, Segmented, Spin, Tag, Tooltip } from 'antd';
import {
  AppstoreOutlined, AuditOutlined, BankOutlined, BarChartOutlined, BookOutlined,
  CheckSquareOutlined, DatabaseOutlined, DeploymentUnitOutlined, DiffOutlined,
  ExportOutlined, LogoutOutlined, ReadOutlined, SafetyOutlined, ScheduleOutlined,
  SwapOutlined, TagsOutlined, TeamOutlined, UserOutlined,
} from '@ant-design/icons';
import { useStudio } from './StudioContext';
import CommandPalette from './CommandPalette';
import { SITE_URL } from '@/lib/site';
import { avatarOf, c, initials, ISSUE, ROLE_LABEL, toAr } from '@/lib/tokens';

/** Routes that render without the app chrome. */
const BARE_ROUTES = ['/login'];

interface NavItem {
  key: string;
  icon: ReactNode;
  label: string;
  badge?: 'pending';
  /** Permission required to see this section at all. */
  requires?: string;
}

const WORK_NAV: NavItem[] = [
  { key: '/', icon: <AppstoreOutlined />, label: 'داشبۆرد' },
  { key: '/queue', icon: <CheckSquareOutlined />, label: 'ڕیزی پەسەندکردن', badge: 'pending' },
  { key: '/sanad', icon: <DeploymentUnitOutlined />, label: 'پشکنینی سەنەد' },
  { key: '/compare', icon: <DiffOutlined />, label: 'بەراورد' },
  { key: '/stats', icon: <BarChartOutlined />, label: 'ئامار' },
];

const DATA_NAV: NavItem[] = [
  { key: '/hadiths', icon: <ReadOutlined />, label: 'حەدیس' },
  { key: '/narrators', icon: <UserOutlined />, label: 'ڕاویان' },
  { key: '/books', icon: <BookOutlined />, label: 'پەرتووکەکان' },
  { key: '/authors', icon: <BankOutlined />, label: 'نووسەران' },
  { key: '/chapters', icon: <ScheduleOutlined />, label: 'بابەتەکان' },
  { key: '/glossary', icon: <TagsOutlined />, label: 'فەرهەنگ' },
  { key: '/topics', icon: <TagsOutlined />, label: 'بابەتە گشتییەکان' },
];

const ADMIN_NAV: NavItem[] = [
  { key: '/admin/users', icon: <TeamOutlined />, label: 'بەکارهێنەر و تیم', requires: 'admin' },
  { key: '/admin/assignments', icon: <SwapOutlined />, label: 'دابەشکردن', requires: 'admin' },
  { key: '/admin/audit', icon: <AuditOutlined />, label: 'تۆماری کردار', requires: 'admin' },
  { key: '/admin/quality', icon: <DatabaseOutlined />, label: 'جۆری داتا' },
];

/** Just the host, so the chip names the source without a URL in the chrome. */
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/** The header label for the current route — the page's name, beside the brand. */
const TITLES: Record<string, string> = Object.fromEntries(
  [...WORK_NAV, ...DATA_NAV, ...ADMIN_NAV].map((i) => [i.key, i.label]),
);

export default function StudioChrome({
  children, pendingCount, collections = [], corpus,
}: {
  children: ReactNode;
  pendingCount?: number;
  /** Open issues by type — the "smart collections". */
  collections?: Array<{ type: string; count: number }>;
  corpus?: { hadiths: number | null; books: number | null; narrators: number | null };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, can, logout, demo, corpusSource } = useStudio();

  const bare = BARE_ROUTES.some((r) => pathname.startsWith(r));

  // Gate: no identity means back to the login screen. Done in an effect rather
  // than in the layout so the redirect survives client-side navigation too.
  useEffect(() => {
    if (!loading && !user && !bare) router.replace('/login');
  }, [loading, user, bare, router]);

  if (bare) return <>{children}</>;

  if (loading || !user) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const tone = avatarOf(user.avatar_tone);

  // Longest matching prefix, so /hadith/123 highlights حەدیس and "/" does not
  // swallow every child route.
  const allKeys = [...WORK_NAV, ...DATA_NAV, ...ADMIN_NAV].map((i) => i.key);
  const active =
    allKeys
      .filter((k) => (k === '/' ? pathname === k : pathname.startsWith(k)))
      .sort((a, b) => b.length - a.length)[0]
    ?? (pathname.startsWith('/hadith/') ? '/hadiths'
      : pathname.startsWith('/narrator/') ? '/narrators' : '/');

  const renderItems = (items: NavItem[]) =>
    items
      .filter((i) => !i.requires || can(i.requires))
      .map((i) => (
        <Link
          key={i.key}
          href={i.key}
          className={`rail-item${i.key === active ? ' is-active' : ''}`}
        >
          <span className="anticon">{i.icon}</span>
          <span className="rail-label">{i.label}</span>
          {i.badge === 'pending' && pendingCount ? (
            <span className="rail-count">{toAr(pendingCount)}</span>
          ) : null}
        </Link>
      ));

  const adminVisible = ADMIN_NAV.some((i) => !i.requires || can(i.requires));

  return (
    <>
      <nav className="rail">
        <Link href="/" className="rail-brand">
          <span className="rail-mark">ح</span>
          <span className="rail-wordmark">
            <b>دەزگای حەدیس</b>
            <span>Muhaqqiq · وۆرک‌ستەیشن</span>
          </span>
        </Link>

        <div className="rail-scroll">
          <div className="rail-group">کار</div>
          {renderItems(WORK_NAV)}

          <div className="rail-group">داتا</div>
          {renderItems(DATA_NAV)}

          {adminVisible && (
            <>
              <div className="rail-group">بەڕێوەبردن</div>
              {renderItems(ADMIN_NAV)}
            </>
          )}

          {/* Smart collections: open issues, one click into the queue. Counts
              are live, so an empty category simply disappears. */}
          {collections.length > 0 && (
            <>
              <div className="rail-group">کۆکراوە زیرەکەکان</div>
              {collections.map((col) => {
                const token = ISSUE[col.type];
                if (!token) return null;
                return (
                  <Link key={col.type} href={`/queue?issue=${col.type}`} className="rail-collection">
                    <i style={{ background: token.dot }} />
                    <span>{token.label}</span>
                    <b>{toAr(col.count)}</b>
                  </Link>
                );
              })}
            </>
          )}
        </div>
      </nav>

      <div className="shell">
        <header className="shell-header">
          <span style={{ fontSize: 16, fontWeight: 600, color: c.inkStrong, whiteSpace: 'nowrap' }}>
            {TITLES[active] ?? 'داشبۆرد'}
          </span>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
            <CommandPalette
              commands={[...WORK_NAV, ...DATA_NAV, ...ADMIN_NAV]
                .filter((i) => !i.requires || can(i.requires))
                .map((i) => ({ key: i.key, label: i.label, icon: i.icon }))}
            />
          </div>

          {/* Part of the design, but disabled: there are no translations yet,
              and a control that silently does nothing is worse than an honest
              one. */}
          <Tooltip title="لە ئێستادا تەنها کوردی بەردەستە">
            <Segmented
              size="small"
              value="ku"
              disabled
              options={[
                { value: 'ku', label: 'کوردی' },
                { value: 'ar', label: 'ع' },
                { value: 'en', label: 'EN' },
              ]}
            />
          </Tooltip>

          {/* Whether approving reaches readers is the single most important
              thing to know before using this screen, so it is stated, not implied. */}
          {corpusSource.url && (
            <Tooltip
              title={
                corpusSource.live
                  ? `${hostOf(corpusSource.url)} — پەسەندکردن یەکسەر لە ماڵپەڕی گشتیدا دەردەکەوێت`
                  : `${hostOf(corpusSource.url)} — کۆپییەکی تاقیکردنەوەیە؛ هیچ گۆڕانکارییەک ناگاتە ماڵپەڕی گشتی`
              }
            >
              <Tag
                color={corpusSource.live ? 'error' : 'success'}
                style={{ marginInlineEnd: 0 }}
              >
                {corpusSource.live ? 'داتای ڕاستەقینە' : 'کۆپیی تاقیکردنەوە'}
              </Tag>
            </Tooltip>
          )}

          {demo && (
            <Tooltip title="دۆخی کار، تیم و پلەکانی ڕیز نموونەیین — نەک حوکمی زانایان.">
              <Tag color="warning" style={{ marginInlineEnd: 0 }}>نموونە</Tag>
            </Tooltip>
          )}

          <Tooltip title="ماڵپەڕی گشتی">
            <a
              href={SITE_URL}
              target="_blank"
              rel="noreferrer"
              style={{ color: c.inkFaint, display: 'grid', placeItems: 'center', fontSize: 16.5 }}
            >
              <ExportOutlined />
            </a>
          </Tooltip>

          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'who',
                  disabled: true,
                  label: (
                    <div style={{ paddingBlock: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: c.ink }}>{user.name}</div>
                      <div dir="ltr" style={{ fontSize: 13.5, color: c.inkGhost, textAlign: 'start' }}>
                        {user.email}
                      </div>
                    </div>
                  ),
                },
                { type: 'divider' },
                {
                  key: 'role',
                  disabled: true,
                  icon: <SafetyOutlined />,
                  label: <span style={{ fontSize: 14.5 }}>{ROLE_LABEL[user.role] ?? user.role}</span>,
                },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: 'دەرچوون', onClick: logout },
              ],
            }}
          >
            <button
              style={{
                display: 'flex', alignItems: 'center', gap: 9, height: 40, padding: '0 4px',
                background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'inherit', lineHeight: 1.3,
              }}
            >
              <span style={{ textAlign: 'start' }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: c.ink }}>
                  {user.name}
                </span>
                <span style={{ display: 'block', fontSize: 13, color: c.inkGhost }}>
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </span>
              <Avatar
                size={32}
                style={{ background: tone.bg, color: tone.fg, fontSize: 14, fontWeight: 600 }}
              >
                {initials(user.name)}
              </Avatar>
            </button>
          </Dropdown>
        </header>

        <div className="shell-body">{children}</div>

        <footer className="shell-status">
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6fce9f' }} />
            هەموو شت پاشەکەوتکراوە
          </span>
          {corpus?.hadiths != null && (
            <span>
              {toAr(corpus.hadiths.toLocaleString('en'))} حەدیس ·{' '}
              {toAr((corpus.books ?? 0).toLocaleString('en'))} پەرتووک ·{' '}
              {toAr((corpus.narrators ?? 0).toLocaleString('en'))} ڕاوی
            </span>
          )}
          <span style={{ marginInlineStart: 'auto' }}>کوردی (سۆرانی) · RTL</span>
        </footer>
      </div>
    </>
  );
}
