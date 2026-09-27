'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Avatar, Button, Card, Empty, Popconfirm, Select, Space, Spin, Tag, Timeline, Typography,
} from 'antd';
import { ReloadOutlined, RollbackOutlined } from '@ant-design/icons';
import { useStudio } from './StudioContext';
import { useToast } from './useToast';
import { agoKu, avatarOf, c, initials, toAr, shell } from '@/lib/tokens';

const { Text, Title } = Typography;

interface Entry {
  id: number; action: string; entity_type: string | null; entity_id: string | null;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  reason: string | null; reverted: boolean; created_at: string;
  actor_id: number | null; actor_name: string | null; avatar_tone: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  approve: 'پەسەندکردن', reject: 'ڕەتکردنەوە', edit: 'دەستکاری', assign: 'دابەشکردن',
  merge: 'یەکخستن', role_change: 'گۆڕینی ڕۆڵ', login: 'چوونەژوورەوە', publish: 'بڵاوکردنەوە',
  permission_change: 'گۆڕینی مۆڵەت', revert: 'گەڕاندنەوە',
  create: 'دروستکردن', delete: 'سڕینەوە', restore: 'گەڕاندنەوە',
  rebalance: 'هاوسەنگکردنی بارکاری', issue_resolved: 'چارەسەرکردنی کێشە',
  isnad_edit: 'دەستکاری زنجیرە', isnad_reset: 'گەڕاندنەوەی زنجیرە',
  'status:approved': 'پەسەندکردن', 'status:rejected': 'ڕەتکردنەوە',
  'status:published': 'بڵاوکردنەوە', 'status:duplicate': 'نیشانکردن وەک دووبارە',
  'status:discuss': 'ناردن بۆ گفتوگۆ', 'status:research': 'ناردن بۆ لێکۆڵینەوە',
  'status:conflict': 'نیشانکردن وەک ناکۆک', 'status:pending': 'گەڕاندنەوە بۆ ڕیز',
};

/** Tag colour per kind of action, so a scan of the log reads by category. */
function actionColor(action: string): string | undefined {
  if (/reject|delete|conflict/.test(action)) return 'error';
  if (/approve|publish|create|restore|resolved/.test(action)) return 'success';
  if (/role|permission|rebalance|assign/.test(action)) return 'processing';
  if (/revert/.test(action)) return 'warning';
  return undefined;
}

const ENTITY_PREFIX: Record<string, string> = {
  hadith: 'HDT', narrator: 'NAR', book: 'BK', author: 'AUT', chapter: 'CH',
  word: 'WRD', topic: 'TOP', user: 'USR', role: 'ROL', team: 'TEAM', issue: 'ISS',
};

/** Only state changes can be undone; a login or a publish is a fact, not a setting. */
const REVERSIBLE = /^status:|^assign$|^edit$|^role_change$/;

export default function AuditView() {
  const { can } = useStudio();
  const toast = useToast();
  const [rows, setRows] = useState<Entry[]>([]);
  const [actors, setActors] = useState<Array<{ id: number; name: string }>>([]);
  const [actor, setActor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const sp = new URLSearchParams({ limit: '100' });
    if (actor) sp.set('actor', String(actor));

    fetch(`/api/audit?${sp}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.success) return;
        setRows(j.data.rows);
        setActors(j.data.actors);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });

    return () => { alive = false; controller.abort(); };
  }, [actor, reloadKey]);

  const revert = async (id: number) => {
    setBusy(id);
    const j = await (await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })).json();
    setBusy(null);
    if (j.success) { toast('گەڕێندرایەوە — ئەمەش تۆمارکرا'); reload(); }
    else toast(j.error ?? 'سەرکەوتوو نەبوو', 'error');
  };

  // Grouped by calendar day, so the log reads as a sequence of working days.
  const days = rows.reduce<Record<string, Entry[]>>((acc, r) => {
    const key = new Date(r.created_at).toISOString().slice(0, 10);
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          flex: 'none', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: `1px solid ${shell.cardBorder}`, flexWrap: 'wrap',
        }}
      >
        <Title level={4} style={{ margin: 0 }}>تۆماری کردار</Title>
        <Tag>نەگۆڕ · append-only</Tag>
        <Space style={{ marginInlineStart: 'auto' }}>
          <Select
            allowClear
            placeholder="هەموو بەکارهێنەران"
            style={{ width: 200 }}
            value={actor}
            onChange={(v) => setActor(v ?? null)}
            options={actors.map((a) => ({ value: a.id, label: a.name }))}
          />
          <Button icon={<ReloadOutlined />} onClick={reload} />
        </Space>
      </div>

      <div className="surface">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : rows.length === 0 ? (
          <Empty description="هیچ تۆمارێک نییە" />
        ) : (
          Object.entries(days).map(([day, entries]) => (
            <Card
              key={day}
              size="small"
              style={{ marginBottom: 14 }}
              title={<span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{day}</span>}
              extra={<Text type="secondary" style={{ fontSize: 15 }}>{toAr(entries.length)} کردار</Text>}
            >
              <Timeline
                items={entries.map((e) => {
                  const tone = avatarOf(e.avatar_tone);
                  const reversible = REVERSIBLE.test(e.action) && !!e.before && !e.reverted;
                  return {
                    icon: (
                      <Avatar size={24} style={{ background: tone.bg, color: tone.fg, fontSize: 14, fontWeight: 600 }}>
                        {initials(e.actor_name)}
                      </Avatar>
                    ),
                    content: (
                      <div style={{ opacity: e.reverted ? 0.55 : 1, marginTop: -2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text strong style={{ fontSize: 16 }}>{e.actor_name ?? 'سیستەم'}</Text>
                          <Tag color={actionColor(e.action)} style={{ marginInlineEnd: 0 }}>
                            {ACTION_LABEL[e.action] ?? e.action}
                          </Tag>
                          {e.entity_id && (
                            <Text style={{ fontSize: 15, color: c.inkGhost }}>
                              <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                                {ENTITY_PREFIX[e.entity_type ?? ''] ?? 'REC'}-{e.entity_id}
                              </span>
                            </Text>
                          )}
                          {e.reverted && <Tag color="error">گەڕێندراوەتەوە</Tag>}
                          <Text style={{ fontSize: 15, color: c.inkGhost, marginInlineStart: 'auto' }}>
                            {agoKu(e.created_at)}
                          </Text>
                          {can('admin') && reversible && (
                            <Popconfirm
                              title="گەڕاندنەوەی ئەم گۆڕانکارییە؟"
                              description="دۆخی پێشوو دەگەڕێتەوە و ئەم کردارەش تۆمار دەکرێت."
                              okText="بەڵێ"
                              cancelText="نەخێر"
                              okButtonProps={{ danger: true }}
                              onConfirm={() => revert(e.id)}
                            >
                              <Button size="small" danger icon={<RollbackOutlined />} loading={busy === e.id}>
                                گەڕاندنەوە
                              </Button>
                            </Popconfirm>
                          )}
                        </div>

                        {(e.before || e.after) && (
                          <Space size={6} wrap style={{ marginTop: 5 }}>
                            {e.before && (
                              <Tag style={{ background: c.rustSoft, color: c.rust, border: 'none', marginInlineEnd: 0 }}>
                                {summarise(e.before)}
                              </Tag>
                            )}
                            {e.before && e.after && <Text style={{ color: c.inkPale }}>←</Text>}
                            {e.after && (
                              <Tag style={{ background: c.emeraldTint, color: c.emerald, border: 'none', marginInlineEnd: 0 }}>
                                {summarise(e.after)}
                              </Tag>
                            )}
                          </Space>
                        )}

                        {e.reason && (
                          <div><Text type="secondary" style={{ fontSize: 15 }}>هۆکار: {e.reason}</Text></div>
                        )}
                      </div>
                    ),
                  };
                })}
              />
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

/** Compact one-line rendering of a before/after blob. */
function summarise(o: Record<string, unknown>): string {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 2)
    .map(([k, v]) => {
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}: ${s.length > 28 ? `${s.slice(0, 28)}…` : s}`;
    });
  return parts.length ? parts.join(' · ') : '—';
}
