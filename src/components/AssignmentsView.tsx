'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Alert, Avatar, Button, Card, Descriptions, Popconfirm, Progress, Segmented, Select, Space,
  Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SwapOutlined } from '@ant-design/icons';
import { useStudio } from './StudioContext';
import { useToast } from './useToast';
import { avatarOf, c, initials, ROLE_LABEL, toAr, shell } from '@/lib/tokens';

const { Text, Title } = Typography;

interface Person {
  id: number; name: string; avatar_tone: string; role: string; open: number; done: number;
}
interface BookLoad { book: string; total: number; open: number }

/** Load bands: heavy / full / fitting / light, relative to the team average. */
function band(open: number, avg: number) {
  if (avg === 0) return { label: 'سووک', color: c.inkFaint, bg: c.neutral };
  const ratio = open / avg;
  if (ratio > 1.4) return { label: 'قورس', color: c.rust, bg: c.rustSoft };
  if (ratio > 1.1) return { label: 'پڕ', color: c.goldFg, bg: c.goldTint };
  if (ratio > 0.6) return { label: 'گونجاو', color: c.emerald, bg: c.emeraldTint };
  return { label: 'سووک', color: c.blue, bg: c.blueSoft };
}

export default function AssignmentsView({
  people, byBook, teams, unassigned,
}: {
  people: Person[];
  byBook: BookLoad[];
  teams: Array<{ id: number; name: string; color: string }>;
  unassigned: number;
}) {
  const router = useRouter();
  const { can } = useStudio();
  const toast = useToast();
  const [view, setView] = useState<'people' | 'books'>('people');
  const [team, setTeam] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const totalOpen = people.reduce((s, p) => s + p.open, 0);
  const avg = people.length ? totalOpen / people.length : 0;
  const peak = Math.max(1, ...people.map((p) => p.open));
  const bookPeak = Math.max(1, ...byBook.map((b) => b.total));

  const heavy = people.filter((p) => p.open > avg * 1.4);
  const light = people.filter((p) => p.open < avg * 0.6);

  const rebalance = async () => {
    setBusy(true);
    const j = await (await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: team }),
    })).json();
    setBusy(false);
    if (j.success) {
      toast(`${toAr(j.data.moved)} ڕەکۆرد گواسترایەوە — ئاستی ئامانج ${toAr(j.data.target)}`);
      router.refresh();
    } else toast(j.error ?? 'سەرکەوتوو نەبوو', 'error');
  };

  const peopleColumns: ColumnsType<Person> = [
    {
      title: 'ئەندام', key: 'name', width: 210,
      render: (_, p) => {
        const t = avatarOf(p.avatar_tone);
        return (
          <Space size={9}>
            <Avatar size={28} style={{ background: t.bg, color: t.fg, fontSize: 15, fontWeight: 600 }}>
              {initials(p.name)}
            </Avatar>
            <div style={{ lineHeight: 1.3 }}>
              <Text strong style={{ fontSize: 16 }}>{p.name}</Text>
              <div><Text type="secondary" style={{ fontSize: 15 }}>{ROLE_LABEL[p.role] ?? p.role}</Text></div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'بارکاری', key: 'bar',
      render: (_, p) => (
        <Progress
          percent={Math.round((p.open / peak) * 100)}
          showInfo={false}
          strokeColor={band(p.open, avg).color}
          railColor={c.line}
          style={{ margin: 0 }}
        />
      ),
    },
    {
      title: 'ئاست', key: 'band', width: 90,
      render: (_, p) => {
        const b = band(p.open, avg);
        return <Tag style={{ background: b.bg, color: b.color, border: 'none' }}>{b.label}</Tag>;
      },
    },
    {
      title: 'کراوە', dataIndex: 'open', key: 'open', width: 80, align: 'center',
      sorter: (a, b) => a.open - b.open,
      defaultSortOrder: 'descend',
      render: (v: number) => <Text strong style={{ fontSize: 16.5 }}>{toAr(v)}</Text>,
    },
    {
      title: 'تەواو', dataIndex: 'done', key: 'done', width: 80, align: 'center',
      sorter: (a, b) => a.done - b.done,
      render: (v: number) => <Text type="secondary">{toAr(v)}</Text>,
    },
    {
      title: '', key: 'link', width: 70,
      render: (_, p) => <Link href={`/queue?assignee=${p.id}`} style={{ fontSize: 15 }}>بینین</Link>,
    },
  ];

  const bookColumns: ColumnsType<BookLoad> = [
    {
      title: 'پەرتووک', dataIndex: 'book', key: 'book', width: 260,
      render: (v: string) => <span style={{ fontFamily: 'var(--font-amiri), serif', fontSize: 17.5 }}>{v}</span>,
    },
    {
      title: 'پێشکەوتن', key: 'bar',
      render: (_, b) => (
        <Progress
          percent={Math.round((b.total / bookPeak) * 100)}
          success={{ percent: Math.round(((b.total - b.open) / bookPeak) * 100), strokeColor: c.emerald }}
          strokeColor={c.gold}
          railColor={c.line}
          showInfo={false}
          style={{ margin: 0 }}
        />
      ),
    },
    {
      title: 'تەواو', key: 'done', width: 80, align: 'center',
      render: (_, b) => <Text style={{ color: c.emerald }}>{toAr(b.total - b.open)}</Text>,
    },
    {
      title: 'ماوە', dataIndex: 'open', key: 'open', width: 80, align: 'center',
      sorter: (a, b) => a.open - b.open,
      render: (v: number) => <Text style={{ color: c.goldFg }}>{toAr(v)}</Text>,
    },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          style={{
            flex: 'none', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
            borderBottom: `1px solid ${shell.cardBorder}`, flexWrap: 'wrap',
          }}
        >
          <Title level={4} style={{ margin: 0 }}>دابەشکردن</Title>
          <Segmented
            value={view}
            onChange={(v) => setView(v as 'people' | 'books')}
            options={[
              { value: 'people', label: 'بەپێی کەس' },
              { value: 'books', label: 'بەپێی پەرتووک' },
            ]}
          />
          {unassigned > 0 && <Tag color="warning">{toAr(unassigned)} نەدابەشکراو</Tag>}

          <Space style={{ marginInlineStart: 'auto' }}>
            <Select
              allowClear
              placeholder="هەموو تیمەکان"
              style={{ width: 190 }}
              value={team}
              onChange={(v) => setTeam(v ?? null)}
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
            />
            {/* Wide-reaching action asks first. */}
            <Popconfirm
              title="هاوسەنگکردنی خۆکار؟"
              description={
                <span style={{ fontSize: 16 }}>
                  هەموو ڕەکۆردە کراوەکان{team ? ' لەم تیمەدا' : ''} بەسەر ئەندامانی کەمبار
                  دابەش دەکرێنەوە. ئەمە بەرپرسیارێتی ئێستا دەگۆڕێت.
                </span>
              }
              okText="بەڵێ، هاوسەنگی بکە"
              cancelText="پاشگەزبوونەوە"
              disabled={!can('admin')}
              onConfirm={rebalance}
            >
              <Button
                type="primary"
                style={{ background: c.gold, borderColor: c.gold }}
                icon={<SwapOutlined />}
                loading={busy}
                disabled={!can('admin')}
              >
                هاوسەنگکردنی خۆکار
              </Button>
            </Popconfirm>
          </Space>
        </div>

        <div className="surface">
          <Card size="small" styles={{ body: { padding: 0 } }}
            title={view === 'people' ? 'بارکاری ئەندامان' : 'بارکاری بەپێی پەرتووک'}>
            {view === 'people' ? (
              <Table<Person> rowKey="id" size="small" columns={peopleColumns} dataSource={people} pagination={false} />
            ) : (
              <Table<BookLoad> rowKey="book" size="small" columns={bookColumns} dataSource={byBook} pagination={false} />
            )}
          </Card>
        </div>
      </div>

      <aside className="side-rail">
        <Card size="small" title="کورتە">
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 'open', label: 'کۆی کراوە', children: toAr(totalOpen) },
              { key: 'people', label: 'ئەندامی چالاک', children: toAr(people.length) },
              { key: 'avg', label: 'ناوەندی هەر کەس', children: toAr(Math.round(avg)) },
              {
                key: 'un', label: 'نەدابەشکراو',
                children: <Text style={{ color: unassigned ? c.goldFg : undefined }}>{toAr(unassigned)}</Text>,
              },
            ]}
          />
        </Card>

        <Card size="small" title="پێشنیار">
          {heavy.length === 0 ? (
            <Alert type="success" showIcon title="بارکاری بە ڕێژەیەکی باش دابەشکراوە." />
          ) : (
            <Alert
              type="warning"
              showIcon
              title={
                <span style={{ fontSize: 15, lineHeight: 1.9 }}>
                  <b>{heavy.map((p) => p.name).join('، ')}</b> زۆر بارکراون
                  {light.length > 0 && <> و <b>{light.map((p) => p.name).join('، ')}</b> جێگەی زیادەیان هەیە</>}
                  . «هاوسەنگکردنی خۆکار» ئەمە ڕاست دەکاتەوە.
                </span>
              }
            />
          )}
        </Card>
      </aside>
    </div>
  );
}
