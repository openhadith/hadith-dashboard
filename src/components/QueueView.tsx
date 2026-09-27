'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Avatar, Badge, Button, Card, Empty, Input, Segmented, Select, Space, Table, Tag, Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckOutlined, CloseOutlined, CopyOutlined, QuestionOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useStudio } from './StudioContext';
import { useToast } from './useToast';
import { agoKu, avatarOf, c, GRADE, initials, ISSUE, STATUS, toAr, shell } from '@/lib/tokens';

const { Text } = Typography;

interface QueueRow {
  id: number;
  entity_id: string;
  status: string;
  grade: string | null;
  priority: number;
  updated_at: string;
  snapshot: { matn?: string; bookTitle?: string; type?: string; gradeSource?: string };
  assignee_id: number | null;
  assignee_name: string | null;
  avatar_tone: string | null;
  team_name: string | null;
  team_color: string | null;
  issues: Array<{ type: string; severity: string; detector: string }>;
}

interface Counts { status: Record<string, number>; issue: Record<string, number>; all: number }

interface Props {
  users: Array<{ id: number; name: string; avatar_tone: string; role: string }>;
  savedViews: Array<{ label: string; icon: string; query: Record<string, string> }>;
  teams: Array<{ id: number; name: string; color: string }>;
}

const CHIPS = [
  'all', 'pending', 'discuss', 'research', 'conflict', 'duplicate', 'approved', 'published',
] as const;

const CHIP_LABEL: Record<string, string> = {
  all: 'هەموو', ...Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label])),
};

export default function QueueView({ users, savedViews, teams }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useStudio();
  const toast = useToast();

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [counts, setCounts] = useState<Counts>({ status: {}, issue: {}, all: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const status = params.get('status') ?? 'all';
  const issue = params.get('issue') ?? '';
  const assignee = params.get('assignee') ?? '';
  const sort = params.get('sort') ?? 'recent';
  const [term, setTerm] = useState(params.get('q') ?? '');

  const wrapRef = useRef<HTMLDivElement>(null);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    // State is written only when the response lands; stale responses are
    // dropped. Rows stay on screen while the next page loads.
    let alive = true;
    const controller = new AbortController();

    const sp = new URLSearchParams({ page: String(page), limit: '25', sort });
    if (status !== 'all') sp.set('status', status);
    if (issue) sp.set('issue', issue);
    if (assignee) sp.set('assignee', assignee);
    if (term.trim()) sp.set('q', term.trim());

    fetch(`/api/queue?${sp}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.success) return;
        setRows(j.data.rows);
        setCounts(j.data.counts);
        setTotal(j.data.pagination.total);
        setCursor(0);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [page, status, issue, assignee, sort, term, reloadKey]);

  /**
   * Writes one filter into the URL so views are linkable and Back works.
   * Page resets here rather than in an effect — a filter change *is* the event
   * that invalidates the current page.
   */
  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (value === null || value === '' || value === 'all') sp.delete(key);
    else sp.set(key, value);
    setPage(1);
    router.replace(`/queue${sp.toString() ? `?${sp}` : ''}`, { scroll: false });
  };

  // Keyboard-first: ↑↓ move, Space selects, Enter opens, Esc clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((i) => Math.min(rows.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1))));
      } else if (e.key === ' ') {
        e.preventDefault();
        const row = rows[cursor];
        if (row) {
          setSelected((s) => (s.includes(row.id) ? s.filter((x) => x !== row.id) : [...s, row.id]));
        }
      } else if (e.key === 'Enter') {
        if (rows[cursor]) router.push(`/hadith/${rows[cursor].entity_id}`);
      } else if (e.key === 'Escape') {
        setSelected([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, cursor, router]);

  useEffect(() => {
    wrapRef.current
      ?.querySelector(`[data-row-key="${rows[cursor]?.id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor, rows]);

  const transition = async (next: string | null, assigneeId?: number) => {
    if (!selected.length) return;
    setBusy(true);
    const res = await fetch('/api/queue/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selected, status: next ?? undefined, assigneeId }),
    });
    const j = await res.json();
    setBusy(false);
    if (!j.success) {
      toast(j.error ?? 'کردارەکە سەرکەوتوو نەبوو', 'error');
      return;
    }
    const failed: Array<{ entityId: string; error: string }> = j.data.failed ?? [];
    if (failed.length) {
      // Refused publishes stay selected so they can be opened and fixed.
      toast(
        `${toAr(j.data.count)} نوێکرایەوە · ${toAr(failed.length)} بڵاونەکرایەوە: ${failed[0].error}`,
        'warn',
      );
      setSelected(selected.filter((id) => failed.some((f) => rows.find((r) => r.id === id)?.entity_id === f.entityId)));
    } else {
      toast(`${toAr(j.data.count)} ڕەکۆرد نوێکرایەوە`);
      setSelected([]);
    }
    reload();
  };

  const columns: ColumnsType<QueueRow> = [
    {
      title: 'دەقی حەدیس',
      key: 'matn',
      render: (_, r) => {
        const st = STATUS[r.status] ?? STATUS.pending;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Tooltip title={st.label}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot, flex: 'none' }} />
            </Tooltip>
            <span
              dir="rtl"
              style={{
                fontFamily: 'var(--font-amiri), serif', fontSize: 17.5, lineHeight: 1.7,
                display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {r.snapshot.matn || '—'}
            </span>
          </div>
        );
      },
    },
    {
      title: 'سەرچاوە', key: 'book', width: 148, ellipsis: true,
      render: (_, r) => (
        <Text style={{ fontSize: 15, color: c.inkFaint }}>{r.snapshot.bookTitle ?? '—'}</Text>
      ),
    },
    {
      title: 'پلە', key: 'grade', width: 74,
      render: (_, r) => {
        const g = GRADE[r.grade ?? 'unknown'] ?? GRADE.unknown;
        return (
          <Tooltip title={r.snapshot.gradeSource === 'demo' ? 'پلەی نموونەیی — نەک حوکمی ڕەسەن' : undefined}>
            <Tag style={{ background: g.bg, color: g.fg, border: 'none', marginInlineEnd: 0 }}>
              {g.label}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'کێشەکان', key: 'issues', width: 118,
      render: (_, r) =>
        r.issues.length === 0 ? (
          <Text style={{ fontSize: 15, color: c.inkPale }}>—</Text>
        ) : (
          <Space size={4} wrap>
            {r.issues.slice(0, 2).map((is, k) => {
              const t = ISSUE[is.type] ?? ISSUE.unknown;
              return (
                <Tag key={k} style={{ background: t.bg, color: t.fg, border: 'none', marginInlineEnd: 0 }}>
                  {t.label}
                </Tag>
              );
            })}
            {r.issues.length > 2 && <Text style={{ fontSize: 14.5 }}>+{toAr(r.issues.length - 2)}</Text>}
          </Space>
        ),
    },
    {
      title: 'بەرپرس', key: 'assignee', width: 118,
      render: (_, r) =>
        r.assignee_name ? (
          // Truncated rather than wrapped: this list is driven by ↑↓, and a
          // long name on one row would make that row taller than its
          // neighbours and the cursor jump unevenly down the page.
          <span
            title={r.assignee_name}
            style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
          >
            <Avatar
              size={21}
              style={{
                background: avatarOf(r.avatar_tone).bg, color: avatarOf(r.avatar_tone).fg,
                fontSize: 13.5, fontWeight: 600, flex: 'none',
              }}
            >
              {initials(r.assignee_name)}
            </Avatar>
            <Text ellipsis style={{ fontSize: 15 }}>{r.assignee_name}</Text>
          </span>
        ) : (
          <Text style={{ fontSize: 15, color: c.inkPale }}>نەدابەشکراو</Text>
        ),
    },
    {
      title: 'نوێکراوە', key: 'updated', width: 80,
      render: (_, r) => <Text style={{ fontSize: 15, color: c.inkGhost }}>{agoKu(r.updated_at)}</Text>,
    },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          style={{
            flex: 'none', padding: '20px 32px 16px', display: 'flex', flexDirection: 'column',
            gap: 14, borderBottom: `1px solid ${shell.cardBorder}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>ڕیزی پەسەندکردن</Typography.Title>
            <Text type="secondary" style={{ fontSize: 16 }}>{toAr(total)} ڕەکۆرد</Text>
            <Space style={{ marginInlineStart: 'auto' }}>
              <Input.Search
                allowClear
                defaultValue={term}
                placeholder="گەڕان لە دەقی حەدیس…"
                style={{ width: 240 }}
                onSearch={(v) => { setPage(1); setTerm(v); }}
              />
              <Select
                value={sort}
                style={{ width: 120 }}
                onChange={(v) => setParam('sort', v)}
                options={[
                  { value: 'recent', label: 'نوێترین' },
                  { value: 'oldest', label: 'کۆنترین' },
                  { value: 'priority', label: 'گرنگی' },
                ]}
              />
              <Button icon={<ReloadOutlined />} onClick={reload} />
            </Space>
          </div>

          {/* Eight filters do not fit at this type size on a 1440px screen, and a
              Segmented track cannot wrap. Scrolling the row is honest about
              that; clipping it would silently hide the last filters. */}
          <div className="chip-row">
            <Segmented
              value={status}
              onChange={(v) => setParam('status', String(v))}
              options={CHIPS.map((id) => ({
                value: id,
                label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {id !== 'all' && (
                    <span
                      style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: STATUS[id]?.dot ?? c.inkPale,
                      }}
                    />
                  )}
                  {CHIP_LABEL[id]}
                  <Text style={{ fontSize: 15, color: c.inkGhost }}>
                    {toAr(id === 'all' ? counts.all : (counts.status[id] ?? 0))}
                  </Text>
                </span>
                ),
              }))}
            />
          </div>
        </div>

        {/* Bulk bar — appears only with a selection. */}
        {selected.length > 0 && (
          <div
            style={{
              flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 32px',
              background: c.emeraldSoft, borderBottom: '1px solid #cfe3d7', flexWrap: 'wrap',
            }}
          >
            <Text strong style={{ color: c.emerald, fontSize: 16 }}>
              {toAr(selected.length)} هەڵبژێردراو
            </Text>
            <Tooltip title={can('approve') ? undefined : 'ڕۆڵەکەت مۆڵەتی پەسەندکردنی نییە'}>
              <Button size="small" type="primary" icon={<CheckOutlined />}
                disabled={busy || !can('approve')} onClick={() => transition('approved')}>
                پەسەندکردن
              </Button>
            </Tooltip>
            <Tooltip title={can('reject') ? undefined : 'ڕۆڵەکەت مۆڵەتی ڕەتکردنەوەی نییە'}>
              <Button size="small" danger icon={<CloseOutlined />}
                disabled={busy || !can('reject')} onClick={() => transition('rejected')}>
                ڕەتکردنەوە
              </Button>
            </Tooltip>
            <Button size="small" icon={<QuestionOutlined />} disabled={busy || !can('edit')}
              onClick={() => transition('discuss')}>
              گفتوگۆ
            </Button>
            <Button size="small" icon={<CopyOutlined />} disabled={busy || !can('merge')}
              onClick={() => transition('duplicate')}>
              دووبارە
            </Button>
            <Select
              size="small"
              placeholder="دابەشکردن بۆ…"
              style={{ width: 160 }}
              value={null}
              disabled={busy || !can('edit')}
              onChange={(v) => transition(null, Number(v))}
              options={users.map((u) => ({ value: u.id, label: u.name }))}
            />
            <Button size="small" type="link" onClick={() => setSelected([])}>
              پاشگەزبوونەوە (Esc)
            </Button>
          </div>
        )}

        <div ref={wrapRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 32px 28px' }}>
          <Table<QueueRow>
            rowKey="id"
            size="small"
            sticky
            columns={columns}
            dataSource={rows}
            loading={loading}
            locale={{ emptyText: <Empty description="هیچ ڕەکۆردێک نەدۆزرایەوە" /> }}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys as number[]),
            }}
            rowClassName={(_, i) => (i === cursor ? 'studio-row-cursor' : '')}
            onRow={(row, i) => ({
              onClick: () => setCursor(i ?? 0),
              onDoubleClick: () => router.push(`/hadith/${row.entity_id}`),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: page,
              pageSize: 25,
              total,
              showSizeChanger: false,
              onChange: setPage,
              showTotal: (t, [from, to]) => `${toAr(from)}–${toAr(to)} لە ${toAr(t)}`,
            }}
          />
        </div>

        <div
          style={{
            flex: 'none', display: 'flex', alignItems: 'center', gap: 16, padding: '9px 32px',
            background: shell.card, borderTop: `1px solid ${shell.cardBorder}`,
            fontSize: 15, color: c.inkFaint,
          }}
        >
          <span>↑↓ گەڕان</span>
          <span>Space هەڵبژاردن</span>
          <span>Enter کردنەوە</span>
          <span>Esc پاشگەزبوونەوە</span>
        </div>
      </div>

      <aside className="side-rail">
        <Card title="دیمەنە پاشەکەوتکراوەکان" size="small" styles={{ body: { padding: 6 } }}>
          {savedViews.map((v) => (
            <Button
              key={v.label}
              type="text"
              block
              style={{ justifyContent: 'flex-start', fontSize: 16 }}
              onClick={() => {
                const sp = new URLSearchParams();
                Object.entries(v.query).forEach(([k, val]) => sp.set(k, String(val)));
                setPage(1);
                router.replace(`/queue?${sp}`, { scroll: false });
              }}
            >
              <span style={{ marginInlineEnd: 6 }}>{v.icon}</span>
              {v.label}
            </Button>
          ))}
        </Card>

        <Card title="کێشەکان" size="small" styles={{ body: { padding: 6 } }}>
          {Object.entries(ISSUE).map(([key, token]) => (
            <Button
              key={key}
              type={issue === key ? 'default' : 'text'}
              block
              style={{
                justifyContent: 'flex-start', fontSize: 15,
                color: issue === key ? c.emerald : undefined,
              }}
              onClick={() => setParam('issue', issue === key ? null : key)}
            >
              <span style={{ width: 7, height: 7, borderRadius: 2, background: token.dot, marginInlineEnd: 7 }} />
              <span style={{ flex: 1, textAlign: 'start' }}>{token.label}</span>
              <Badge
                count={toAr(counts.issue[key] ?? 0)}
                style={{ background: c.sunken, color: c.inkFaint, boxShadow: 'none', fontSize: 14.5 }}
              />
            </Button>
          ))}
        </Card>

        <Card title="تیمەکان" size="small" styles={{ body: { padding: '8px 12px' } }}>
          {teams.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color }} />
              <Text style={{ fontSize: 15 }}>{t.name}</Text>
            </div>
          ))}
        </Card>
      </aside>
    </div>
  );
}
