'use client';

import Link from 'next/link';
import { Avatar, Button, Progress, Tooltip } from 'antd';
import {
  ArrowLeftOutlined, CheckSquareOutlined, CopyOutlined, ExclamationCircleOutlined,
  FileAddOutlined, FileDoneOutlined, SearchOutlined, StarFilled, TrophyOutlined,
} from '@ant-design/icons';
import { Card, Matn, PageHead, Section, Split, StatGrid, StatTile } from './ui';
import type { DashboardData } from '@/lib/dashboard';
import { agoKu, avatarOf, c, initials, shell, toAr, todayLabel } from '@/lib/tokens';

const ACTION_LABEL: Record<string, string> = {
  approve: 'پەسەندی کرد', reject: 'ڕەتی کردەوە', edit: 'دەستکاری کرد',
  assign: 'دابەشی کرد', merge: 'یەکیخست', role_change: 'ڕۆڵی گۆڕی',
  login: 'چووە ژوورەوە', publish: 'بڵاویکردەوە',
  create: 'دروستی کرد', delete: 'سڕییەوە', restore: 'گەڕاندییەوە',
  rebalance: 'بارکاری هاوسەنگ کرد', issue_resolved: 'کێشەیەکی چارەسەر کرد',
  permission_change: 'مۆڵەتی گۆڕی',
  isnad_edit: 'زنجیرەی سەنەدی دەستکاری کرد', isnad_reset: 'زنجیرەی گەڕاندەوە بۆ ڕەسەن',
  'status:approved': 'پەسەندی کرد', 'status:rejected': 'ڕەتی کردەوە',
  'status:published': 'بڵاویکردەوە', 'status:duplicate': 'نیشانی کرد وەک دووبارە',
  'status:discuss': 'ناردی بۆ گفتوگۆ', 'status:research': 'ناردی بۆ لێکۆڵینەوە',
  'status:conflict': 'نیشانی کرد وەک ناکۆک', 'status:pending': 'گەڕاندییەوە بۆ ڕیز',
};

/**
 * A record id, isolated from the surrounding RTL text.
 *
 * Latin-digit ids inside an RTL paragraph get reordered by the bidi algorithm,
 * so a bare "HDT-1" can render with its digits in the wrong place. Ids are
 * identifiers rather than quantities, so they keep Latin digits.
 */
function RecordId({ id }: { id: string }) {
  return <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>HDT-{id}</span>;
}

const ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11,
  padding: '10px 18px', borderBottom: `1px solid ${shell.cardBorderSoft}`,
};

export default function DashboardView({ data }: { data: DashboardData }) {
  const { kpis, week, health, resume, pinned, activity, leaders, user, today, trend, recentEdits } = data;
  const healthPct = health.total ? Math.round((health.clean / health.total) * 100) : 0;
  const peak = Math.max(1, ...week.map((w) => w.count));
  const todayPct = Math.min(100, Math.round((today.done / today.target) * 100));

  return (
    <>
      <div className="surface">
        <PageHead
          title={`بەخێربێیتەوە، ${user.name}`}
          sub={todayLabel()}
          actions={
            <>
              <Link href="/queue">
                <Button type="primary" icon={<CheckSquareOutlined />}>ڕیزی پەسەندکردن</Button>
              </Link>
              <Link href="/hadiths"><Button icon={<SearchOutlined />}>گەڕان</Button></Link>
              <Link href="/glossary"><Button icon={<FileAddOutlined />}>تۆماری نوێ</Button></Link>
            </>
          }
        />

        {/* Today's progress — the one line that says whether the day is on track. */}
        <Card style={{ marginBottom: 'var(--sp-8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 190 }}>
              <div style={{ fontSize: 14.5, color: c.inkFaint, marginBottom: 4 }}>ئەمڕۆ</div>
              <div style={{ fontSize: 16.5, color: c.ink }}>
                {today.done > 0 ? (
                  <>
                    <b style={{ fontSize: 24 }}>{toAr(today.done)}</b>
                    <span style={{ color: c.inkFaint }}> لە {toAr(today.target)} · {toAr(today.remaining)} ماوە</span>
                  </>
                ) : (
                  <span style={{ color: c.inkFaint }}>
                    هێشتا دەستت پێنەکردووە — ئامانج {toAr(today.target)} ڕەکۆردە
                  </span>
                )}
              </div>
            </div>
            <Progress
              percent={todayPct}
              strokeColor={c.emerald}
              railColor="#efeae0"
              style={{ flex: 1, minWidth: 220, margin: 0 }}
              format={(p) => <span style={{ fontSize: 14.5, color: c.inkFaint }}>{toAr(p ?? 0)}٪</span>}
            />
            {resume.length > 0 && (
              <Link href={`/hadith/${resume[0].entity_id}`} className="plain" style={{ flex: '1 1 320px', minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px',
                    background: c.emeraldSoft, border: '1px solid #cfe3d7', borderRadius: 6,
                  }}
                >
                  <ArrowLeftOutlined style={{ color: c.emerald, flex: 'none' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, color: c.emerald, fontWeight: 600 }}>
                      بگەڕەوە بۆ کارە ناتەواوەکەت
                    </span>
                    <Matn size={14} clamp>{resume[0].label}</Matn>
                  </span>
                </div>
              </Link>
            )}
          </div>
        </Card>

        <Section title="کۆی کار">
          <StatGrid>
          <StatTile
            label="چاوەڕوانی پێداچوونەوە"
            value={toAr(kpis.pending)}
            href="/queue?status=pending"
            icon={<FileDoneOutlined />}
            iconBg={c.goldSoft}
            iconColor={c.goldFg}
            delta={trend.weekPct === null ? null : { pct: trend.weekPct, good: trend.weekPct >= 0 }}
            deltaTitle="بڕیارەکان بەراورد بە هەفتەی ڕابردوو"
            hint={`${toAr(kpis.mine)} بە تۆ بەستراوە`}
          />
          <StatTile
            label="ئەمڕۆ تەواوکراو"
            value={toAr(today.done)}
            href="/admin/audit"
            icon={<CheckSquareOutlined />}
            iconBg={c.emeraldTint}
            iconColor={c.emerald}
            hint={`ئامانجی ڕۆژانە ${toAr(today.target)}`}
          />
          <StatTile
            label="ناکۆکییەکان"
            value={toAr(kpis.conflict)}
            href="/queue?status=conflict"
            icon={<ExclamationCircleOutlined />}
            iconBg={c.rustSoft}
            iconColor={c.rust}
            hint={trend.conflicts7 ? `${toAr(trend.conflicts7)} نوێ لەم ٧ ڕۆژەدا` : 'هیچ نوێیەک لەم ٧ ڕۆژەدا'}
          />
          <StatTile
            label="دووبارەی نوێ"
            value={toAr(kpis.duplicate)}
            href="/queue?status=duplicate"
            icon={<CopyOutlined />}
            iconBg={c.blueSoft}
            iconColor={c.blue}
            hint={trend.duplicates7 ? `${toAr(trend.duplicates7)} نوێ لەم ٧ ڕۆژەدا` : 'هیچ نوێیەک لەم ٧ ڕۆژەدا'}
          />
          </StatGrid>
        </Section>

        <Section title="ڕەوتی هەفتە و باری داتا">
          <div style={{ display: 'grid', gap: 'var(--sp-5)', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)' }}>
          <Card
            title="چالاکی ئەم هەفتەیە"
            extra={`کۆ: ${toAr(week.reduce((s, w) => s + w.count, 0))} بڕیار`}
          >
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 132 }}>
              {week.map((w) => {
                const day = new Date(w.day);
                const isPeak = w.count === peak && peak > 0;
                return (
                  <div
                    key={w.day}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: isPeak ? 700 : 400, color: isPeak ? c.emerald : c.inkGhost }}>
                      {toAr(w.count)}
                    </span>
                    <Tooltip title={`${w.day} — ${toAr(w.count)} بڕیار`}>
                      <div
                        style={{
                          width: '100%', maxWidth: 38,
                          height: Math.max(w.count ? 4 : 0, Math.round((w.count / peak) * 96)),
                          borderRadius: '5px 5px 2px 2px',
                          background: isPeak ? c.emerald : '#a7cbbb',
                        }}
                      />
                    </Tooltip>
                    <span style={{ fontSize: 13.5, color: c.inkFaint }}>
                      {['ی', 'د', 'س', 'چ', 'پ', 'ه', 'ش'][day.getDay()]}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="باری داتابەیس">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Progress
                type="circle"
                size={96}
                percent={healthPct}
                strokeColor={c.emerald}
                railColor="#efeae0"
                format={(p) => (
                  <span style={{ lineHeight: 1.2 }}>
                    <span style={{ display: 'block', fontSize: 22, fontWeight: 700, color: c.emerald }}>
                      {toAr(p ?? 0)}٪
                    </span>
                    <span style={{ display: 'block', fontSize: 13, color: c.inkGhost }}>بێ کێشە</span>
                  </span>
                )}
              />
              <div style={{ flex: 1, fontSize: 15, lineHeight: 2.05, color: c.inkMuted }}>
                <Legend color={c.emerald} label="بێ کێشە" value={health.clean} />
                <Legend color={c.rust} label="کێشەی کراوە" value={health.openIssues} />
                <Legend color="#e4ded1" label="کۆی ڕەکۆرد" value={health.total} />
                <Link href="/admin/quality" style={{ fontSize: 14.5 }}>هەموو کێشەکان →</Link>
              </div>
            </div>
            </Card>
          </div>
        </Section>

        <Section title="دوایین جموجۆڵ" action={<Link href="/admin/audit">تۆماری کردار →</Link>}>
          <Split>
          <Card
            title="دواین دەستکارییەکان"
            extra={<Link href="/admin/audit">هەموو</Link>}
            pad={false}
          >
            {recentEdits.length === 0 ? (
              <Empty>هێشتا دەستکارییەک نەکراوە</Empty>
            ) : (
              recentEdits.map((e) => (
                <div key={e.id} style={ROW}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.gold, flex: 'none' }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15 }} className="clamp-1">
                    <b>{e.actor_name ?? 'سیستەم'}</b>{' '}
                    <span style={{ color: c.inkFaint }}>{ACTION_LABEL[e.action] ?? e.action}</span>
                  </span>
                  {e.entity_id && (
                    <span style={{ fontSize: 14, color: c.inkGhost, flex: 'none' }}>
                      <RecordId id={e.entity_id} />
                    </span>
                  )}
                  <span style={{ fontSize: 14, color: c.inkGhost, flex: 'none' }}>{agoKu(e.created_at)}</span>
                </div>
              ))
            )}
          </Card>

          <Card title="پینکراوەکان" pad={false}>
            {pinned.length === 0 ? (
              <Empty>هیچ ڕەکۆردێکی پینکراو نییە</Empty>
            ) : (
              pinned.map((p) => (
                <Link key={p.entity_id} href={`/hadith/${p.entity_id}`} className="plain">
                  <div style={ROW}>
                    <StarFilled style={{ color: c.gold, fontSize: 15 }} />
                    <Matn size={14} clamp style={{ flex: 1, minWidth: 0 }}>{p.label}</Matn>
                    <span style={{ fontSize: 14, color: c.inkGhost, flex: 'none' }}>{p.detail}</span>
                  </div>
                </Link>
              ))
              )}
            </Card>
          </Split>
        </Section>
      </div>

      <aside className="side-rail">
        <Card title="چالاکی تیم" pad={false}>
          {activity.map((a) => {
            const tone = avatarOf(a.avatar_tone);
            return (
              <div key={a.id} style={{ ...ROW, alignItems: 'flex-start', gap: 10 }}>
                <Avatar size={26} style={{ background: tone.bg, color: tone.fg, fontSize: 13, fontWeight: 600, flex: 'none' }}>
                  {initials(a.actor_name)}
                </Avatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, lineHeight: 1.5 }}>
                    <b>{a.actor_name ?? 'سیستەم'}</b>{' '}
                    <span style={{ color: c.inkFaint }}>{ACTION_LABEL[a.action] ?? a.action}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: c.inkGhost }}>
                    {a.entity_id ? <><RecordId id={a.entity_id} />{' · '}</> : null}
                    {agoKu(a.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>

        <Card
          title={<span><TrophyOutlined style={{ color: c.gold }} /> پێشەنگانی هەفتە</span>}
          pad={false}
        >
          {leaders.map((l, i) => {
            const tone = avatarOf(l.avatar_tone);
            return (
              <div key={l.name} style={ROW}>
                <b style={{ width: 14, textAlign: 'center', fontSize: 14.5, color: i < 2 ? c.gold : c.inkGhost }}>
                  {toAr(i + 1)}
                </b>
                <Avatar size={26} style={{ background: tone.bg, color: tone.fg, fontSize: 13, fontWeight: 600 }}>
                  {initials(l.name)}
                </Avatar>
                <span style={{ flex: 1, fontSize: 15 }}>{l.name}</span>
                <b style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{toAr(l.count)}</b>
              </div>
            );
          })}
        </Card>
      </aside>
    </>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flex: 'none' }} />
      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
      <b style={{ color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{toAr(value)}</b>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '22px 18px', textAlign: 'center', fontSize: 15, color: c.inkPale }}>
      {children}
    </div>
  );
}
