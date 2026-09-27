'use client';

import { Card, Col, Row, Statistic, Tag, Typography } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { BarList, ChartCard, ColumnChart } from './charts';
import { Section } from './ui';
import type { StatsData } from '@/lib/stats';
import { ENTITIES, isEntityType } from '@/lib/entities';
import { c, ISSUE, STATUS, toAr } from '@/lib/tokens';

const { Text, Title } = Typography;

const STATUS_ORDER = ['pending', 'discuss', 'research', 'conflict', 'duplicate', 'approved', 'published', 'rejected'];

function Tile({ title, value, suffix, note }: { title: string; value: string; suffix?: string; note?: string }) {
  return (
    <Card size="small" style={{ height: '100%' }}>
      <Statistic
        title={<span style={{ fontSize: 15 }}>{title}</span>}
        value={value}
        suffix={suffix}
        styles={{ content: { fontSize: 28, fontWeight: 700, color: c.inkStrong } }}
      />
      {note && <Text type="secondary" style={{ fontSize: 15 }}>{note}</Text>}
    </Card>
  );
}

export default function StatsView({ data }: { data: StatsData }) {
  const { corpus, totals, statuses, issues, daily, reviewers, books, teams, edits } = data;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="surface">
      <Title level={4} style={{ margin: '0 0 4px' }}>ئامار</Title>
      <Text type="secondary" style={{ fontSize: 16 }}>
        چالاکی پشتڕاستکردنەوە و پێشکەوتنی تیمەکان — ئەم ژمارانە تەنها لێرەن و لە ماڵپەڕی گشتیدا نین.
      </Text>

      {/* Corpus totals — the only figures here that also appear publicly. */}
      <Section
        title={<><GlobalOutlined style={{ marginInlineEnd: 7 }} />کۆی داتا</>}
        action={<Tag style={{ marginInlineEnd: 0 }}>api.openhadith.org</Tag>}
      >
        <Row gutter={[20, 20]}>
        <Col xs={24} sm={8}><Tile title="حەدیس" value={corpus.hadiths === null ? '—' : toAr(corpus.hadiths.toLocaleString('en'))} /></Col>
        <Col xs={24} sm={8}><Tile title="پەرتووک" value={corpus.books === null ? '—' : toAr(corpus.books.toLocaleString('en'))} /></Col>
        <Col xs={24} sm={8}><Tile title="ڕاوی" value={corpus.narrators === null ? '—' : toAr(corpus.narrators.toLocaleString('en'))} /></Col>
        </Row>
      </Section>

      <Section title="کاری وۆرک‌ستەیشن">
        <Row gutter={[20, 20]}>
        <Col xs={12} lg={6}>
          <Tile title="ڕەکۆردی ژێر پێداچوونەوە" value={toAr(totals.reviewed)} />
        </Col>
        <Col xs={12} lg={6}>
          <Tile title="تەواوبوو" value={toAr(totals.donePct)} suffix="٪"
            note={`${toAr(totals.done)} پەسەندکراو یان بڵاوکراوە`} />
        </Col>
        <Col xs={12} lg={6}>
          <Tile title="کێشەی کراوە" value={toAr(totals.openIssues)}
            note={`${toAr(totals.resolvedIssues)} چارەسەرکراو`} />
        </Col>
        <Col xs={12} lg={6}>
          <Tile title="بڕیار لە ٣٠ ڕۆژدا" value={toAr(totals.decisions30)}
            note={`${toAr(totals.auditEvents)} کردار لە تۆماردا`} />
        </Col>
        </Row>
      </Section>

      <Section title="ڕەوت و پێشکەوتن">
        <div>
        <ChartCard
          title="بڕیارەکان بەپێی ڕۆژ"
          subtitle="پەسەندکردن، ڕەتکردنەوە، یەکخستن و گۆڕینی دۆخ — ٣٠ ڕۆژی ڕابردوو"
          table={{
            rowKey: 'day',
            data: [...daily].reverse(),
            columns: [
              { title: 'ڕۆژ', dataIndex: 'day', render: (v: string) => <span dir="ltr">{v}</span> },
              { title: 'بڕیار', dataIndex: 'count', align: 'end', render: (v: number) => toAr(v) },
            ],
          }}
        >
          <ColumnChart
            points={daily.map((d, i) => ({
              key: d.day,
              label: toAr(Number(d.day.slice(8))) + '/' + toAr(Number(d.day.slice(5, 7))),
              // Weekly ticks plus the latest day, skipping a tick that would crowd it.
              showLabel: i === daily.length - 1 || (i % 7 === 0 && daily.length - 1 - i >= 4),
              value: d.count,
              tooltip: <span><span dir="ltr">{d.day}</span> — {toAr(d.count)} بڕیار</span>,
            }))}
          />
        </ChartCard>
        </div>

        <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col xs={24} lg={12}>
          <ChartCard<{ status: string; count: number }>
            title="ڕەکۆردەکان بەپێی دۆخ"
            table={{
              rowKey: 'status',
              data: STATUS_ORDER.filter((s) => statuses[s]).map((s) => ({ status: s, count: statuses[s] })),
              columns: [
                { title: 'دۆخ', dataIndex: 'status', render: (s: string) => STATUS[s]?.label ?? s },
                { title: 'ژمارە', dataIndex: 'count', align: 'end', render: (v: number) => toAr(v) },
                { title: '٪', key: 'p', align: 'end', render: (_: unknown, r: { count: number }) => toAr(pct(r.count, totals.reviewed)) },
              ],
            }}
          >
            <BarList
              rows={STATUS_ORDER.filter((s) => statuses[s]).map((s) => ({
                key: s,
                label: STATUS[s]?.label ?? s,
                marker: STATUS[s]?.dot,
                value: statuses[s],
                tooltip: `${toAr(statuses[s])} ڕەکۆرد · ${toAr(pct(statuses[s], totals.reviewed))}٪`,
              }))}
            />
          </ChartCard>
        </Col>

        <Col xs={24} lg={12}>
          <ChartCard
            title="چالاکی پێداچووەوەکان"
            subtitle="بڕیارەکانی ٣٠ ڕۆژی ڕابردوو"
            table={{
              rowKey: 'name',
              data: reviewers,
              columns: [
                { title: 'ناو', dataIndex: 'name' },
                { title: 'بڕیار', dataIndex: 'decisions', align: 'end', render: (v: number) => toAr(v), sorter: (a, b) => a.decisions - b.decisions },
                { title: 'دەستکاری', dataIndex: 'edits', align: 'end', render: (v: number) => toAr(v) },
              ],
            }}
          >
            <BarList
              rows={reviewers.map((r) => ({
                key: r.name,
                label: r.name,
                value: r.decisions,
                tooltip: `${toAr(r.decisions)} بڕیار · ${toAr(r.edits)} دەستکاری`,
              }))}
            />
          </ChartCard>
        </Col>

        <Col xs={24} lg={12}>
          <ChartCard<{ book: string; total: number; done: number }>
            title="پێشکەوتن بەپێی پەرتووک"
            subtitle="بەشی سەوز = پەسەندکراو یان بڵاوکراوە؛ بەشی خۆڵەمێشی = ماوە"
            table={{
              rowKey: 'book',
              data: books,
              columns: [
                { title: 'پەرتووک', dataIndex: 'book' },
                { title: 'تەواو', dataIndex: 'done', align: 'end', render: (v: number) => toAr(v) },
                { title: 'کۆ', dataIndex: 'total', align: 'end', render: (v: number) => toAr(v) },
                { title: '٪', key: 'p', align: 'end', render: (_: unknown, r: { done: number; total: number }) => toAr(pct(r.done, r.total)) },
              ],
            }}
          >
            <BarList
              labelWidth={190}
              rows={books.map((b) => ({
                key: b.book,
                label: <span style={{ fontFamily: 'var(--font-amiri), serif', fontSize: 17 }}>{b.book}</span>,
                value: b.done,
                total: b.total,
                tip: `${toAr(pct(b.done, b.total))}٪`,
                tooltip: `${toAr(b.done)} لە ${toAr(b.total)} تەواوبوو`,
              }))}
            />
          </ChartCard>
        </Col>

        <Col xs={24} lg={12}>
          <ChartCard
            title="پێشکەوتنی تیمەکان"
            table={{
              rowKey: 'name',
              data: teams,
              columns: [
                { title: 'تیم', dataIndex: 'name' },
                { title: 'تەواو', dataIndex: 'done', align: 'end', render: (v: number) => toAr(v) },
                { title: 'کۆ', dataIndex: 'total', align: 'end', render: (v: number) => toAr(v) },
              ],
            }}
          >
            <BarList
              rows={teams.map((t) => ({
                key: t.name,
                label: t.name,
                marker: t.color,
                value: t.done,
                total: t.total,
                tip: `${toAr(pct(t.done, t.total))}٪`,
                tooltip: `${toAr(t.done)} لە ${toAr(t.total)} تەواوبوو`,
              }))}
            />
          </ChartCard>

          <div style={{ marginTop: 14 }}>
            <ChartCard
              title="کێشە کراوەکان بەپێی جۆر"
              empty={issues.length === 0}
              table={{
                rowKey: 'type',
                data: issues,
                columns: [
                  { title: 'جۆر', dataIndex: 'type', render: (t: string) => ISSUE[t]?.label ?? t },
                  { title: 'کراوە', dataIndex: 'open', align: 'end', render: (v: number) => toAr(v) },
                  { title: 'چارەسەرکراو', dataIndex: 'resolved', align: 'end', render: (v: number) => toAr(v) },
                ],
              }}
            >
              <BarList
                rows={issues.map((i) => ({
                  key: i.type,
                  label: ISSUE[i.type]?.label ?? i.type,
                  marker: ISSUE[i.type]?.dot,
                  value: i.open,
                  tooltip: `${toAr(i.open)} کراوە · ${toAr(i.resolved)} چارەسەرکراو`,
                }))}
              />
            </ChartCard>
          </div>
        </Col>

        <Col xs={24}>
          <ChartCard
            title="گۆڕانکارییەکانی داتا بەپێی جۆر"
            subtitle="ڕەکۆردی نوێ، دەستکاری و شاردنەوە لە وۆرک‌ستەیشندا — داتای ڕەسەن نەگۆڕاوە"
            empty={edits.length === 0}
            table={{
              rowKey: 'type',
              data: edits,
              columns: [
                { title: 'جۆر', dataIndex: 'type', render: (t: string) => (isEntityType(t) ? ENTITIES[t].labelPlural : t === 'isnad' ? 'زنجیرەی سەنەد' : t) },
                { title: 'نوێ', dataIndex: 'created', align: 'end', render: (v: number) => toAr(v) },
                { title: 'دەستکاری', dataIndex: 'edited', align: 'end', render: (v: number) => toAr(v) },
                { title: 'شاردراوە', dataIndex: 'deleted', align: 'end', render: (v: number) => toAr(v) },
              ],
            }}
          >
            <BarList
              labelWidth={170}
              rows={edits.map((e) => ({
                key: e.type,
                label: isEntityType(e.type) ? ENTITIES[e.type].labelPlural : e.type === 'isnad' ? 'زنجیرەی سەنەد' : e.type,
                value: e.created + e.edited + e.deleted,
                tooltip: `${toAr(e.created)} نوێ · ${toAr(e.edited)} دەستکاری · ${toAr(e.deleted)} شاردراوە`,
              }))}
            />
          </ChartCard>
          </Col>
        </Row>
      </Section>
    </div>
  );
}
