'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Drawer, Empty, Input, Popconfirm, Select, Space, Switch, Tag, Tooltip, Typography,
} from 'antd';
import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined, UndoOutlined,
} from '@ant-design/icons';
import { useToast } from './useToast';
import type { EditableLink } from '@/lib/isnad';
import { c, toAr } from '@/lib/tokens';

const { Text } = Typography;
const AMIRI = { fontFamily: 'var(--font-amiri), serif' } as const;

interface NarratorHit { id: string; name: string | null; shohra: string | null; deathdate: string | null }

/**
 * Isnad editor.
 *
 * Works in reading order — source (the Companion) at the top, collector at the
 * bottom — because that is how a reviewer reasons about a chain: "who heard
 * this from whom". Storage is collector-first, so the list is reversed on the
 * way in and out and nothing else has to know.
 */
export default function IsnadEditor({
  hadithId, links, edited, sanadCount, open, onClose, onSaved,
}: {
  hadithId: string;
  /** Collector-first, as stored. */
  links: EditableLink[];
  edited: boolean;
  /** More than one means the chain shown is flattened and cannot be published. */
  sanadCount: number;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  // Working copy, in reading order. The parent mounts this component only while
  // the drawer is open, so initialising here rather than in an effect is both
  // simpler and guarantees a cancelled edit never leaks into the next one.
  const [rows, setRows] = useState<EditableLink[]>(() => [...links].reverse());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [hits, setHits] = useState<NarratorHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [insertAt, setInsertAt] = useState(links.length);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const original = useMemo(() => JSON.stringify([...links].reverse()), [links]);
  const dirty = JSON.stringify(rows) !== original;

  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      const copy = [...r];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const patch = (i: number, p: Partial<EditableLink>) =>
    setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const remove = (i: number) => setRows((r) => r.filter((_, k) => k !== i));

  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const j = await (await fetch(`/api/corpus?kind=narrators&q=${encodeURIComponent(q.trim())}&limit=15`)).json();
        setHits(j.success ? j.data.rows : []);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const insert = (hitId: string) => {
    const hit = hits.find((h) => String(h.id) === hitId);
    if (!hit) return;
    if (rows.some((r) => String(r.rawyId) === String(hit.id))) {
      toast('ئەم ڕاوییە پێشتر لە زنجیرەکەدایە', 'warn');
      return;
    }
    const link: EditableLink = {
      id: `studio-${hit.id}-${Date.now()}`,
      rawyId: String(hit.id),
      toldById: null,
      sanadId: null,
      rawy: {
        Name: hit.name ?? '',
        Shohra: hit.shohra,
        Rotba: null,
        DeathYear: hit.deathdate,
        bio: null,
      },
    };
    setRows((r) => {
      const copy = [...r];
      copy.splice(Math.min(insertAt, copy.length), 0, link);
      return copy;
    });
    setInsertAt((p) => p + 1);
    setHits([]);
  };

  const save = async () => {
    setSaving(true);
    const j = await (await fetch(`/api/isnad/${hadithId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links: [...rows].reverse(), reason: reason || null }),
    })).json();
    setSaving(false);
    if (!j.success) { toast(j.error ?? 'پاشەکەوتکردن سەرکەوتوو نەبوو', 'error'); return; }
    toast('زنجیرە پاشەکەوت کرا');
    onSaved();
  };

  const reset = async () => {
    setSaving(true);
    await fetch(`/api/isnad/${hadithId}`, { method: 'DELETE' });
    setSaving(false);
    toast('زنجیرە گەڕێندرایەوە بۆ ڕەسەن');
    onSaved();
  };

  const positions = [
    { value: 0, label: 'لە سەرەتا (سەرچاوە)' },
    ...rows.map((r, i) => ({
      value: i + 1,
      label: `دوای ${r.rawy?.Shohra || r.rawy?.Name}`,
    })),
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={620}
      title="دەستکاری زنجیرەی سەنەد"
      extra={edited ? <Tag color="warning">ڕەشنووس</Tag> : <Tag>بڵاوکراوە</Tag>}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {edited && (
            <Popconfirm
              title="گەڕاندنەوە بۆ زنجیرەی ڕەسەن؟"
              description="هەموو دەستکارییەکانی ئەم زنجیرەیە لادەبرێن."
              okText="بەڵێ" cancelText="نەخێر" okButtonProps={{ danger: true }}
              onConfirm={reset}
            >
              <Button danger icon={<UndoOutlined />} disabled={saving}>ڕەسەن</Button>
            </Popconfirm>
          )}
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="هۆکاری گۆڕانکاری…"
            style={{ flex: 1 }}
          />
          <Button onClick={onClose}>پاشگەزبوونەوە</Button>
          <Button type="primary" loading={saving} disabled={!dirty || rows.length === 0} onClick={save}>
            پاشەکەوتکردن
          </Button>
        </div>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 14 }}
        title={
          <span style={{ fontSize: 15, lineHeight: 1.8 }}>
            ڕیزبەندی بە شێوەی خوێندنەوەیە: سەرچاوە لە سەرەوە، کۆکەرەوە لە خوارەوە. گۆڕانکارییەکان
            وەک ڕەشنووس هەڵدەگیرێن و کاتی پەسەندکردنی حەدیسەکە لە ماڵپەڕی گشتیدا بڵاو دەکرێنەوە.
            نیشانەی «گومانلێکراو» تەنها لە دەزگاکەدا دەمێنێتەوە.
          </span>
        }
      />

      {sanadCount > 1 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 14 }}
          title={`ئەم حەدیسە ${toAr(sanadCount)} سەنەدی هەیە`}
          description={
            <span style={{ fontSize: 15, lineHeight: 1.8 }}>
              ئەم لیستە هەموو لقەکان بە یەک هێڵ نیشان دەدات، بۆیە گۆڕینی ڕیزبەندی
              بڵاو ناکرێتەوە و پەسەندکردنی حەدیسەکە ڕێگری لێ دەکرێت تا ڕەشنووسەکە
              لابدرێت. نیشانەکردنی «گومانلێکراو» بێ کێشەیە.
            </span>
          }
        />
      )}

      {rows.length === 0 ? (
        <Empty description="زنجیرە بەتاڵە — ڕاوییەک زیاد بکە" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((l, i) => {
            const rutba = Number(l.rawy?.Rotba ?? l.rawy?.bio?.rutba ?? 0);
            const dot = !rutba ? c.inkPale : rutba <= 3 ? c.emerald : rutba <= 6 ? c.gold : c.rust;
            return (
              <div
                key={l.id}
                style={{
                  padding: '9px 11px', borderRadius: 10, background: c.raised,
                  border: `1px ${l.flagged ? 'dashed' : 'solid'} ${l.flagged ? c.rust : c.lineCard}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text style={{ width: 20, textAlign: 'center', fontSize: 15, color: c.inkGhost }}>
                    {toAr(i + 1)}
                  </Text>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong ellipsis style={{ ...AMIRI, fontSize: 18, display: 'block' }}>
                      {l.rawy?.Shohra || l.rawy?.Name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 15 }}>
                      {l.rawy?.bio?.rutba_description ?? ''}
                      {l.rawy?.DeathYear ? ` · ت ${toAr(l.rawy.DeathYear)}` : ''}
                      {l.id.startsWith('studio-') ? ' · زیادکراو' : ''}
                    </Text>
                  </div>
                  {i === 0 && <Tag color="success" style={{ marginInlineEnd: 0 }}>سەرچاوە</Tag>}
                  {i === rows.length - 1 && rows.length > 1 && <Tag style={{ marginInlineEnd: 0 }}>کۆکەرەوە</Tag>}
                  <Tooltip title="نیشانکردن وەک بەستەری گومانلێکراو">
                    <Switch
                      size="small"
                      checked={!!l.flagged}
                      onChange={(v) => patch(i, { flagged: v, note: v ? l.note ?? '' : null })}
                    />
                  </Tooltip>
                  <Space.Compact>
                    <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                    <Button size="small" icon={<ArrowDownOutlined />} disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
                  </Space.Compact>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
                </div>
                {l.flagged && (
                  <Input
                    size="small"
                    value={l.note ?? ''}
                    onChange={(e) => patch(i, { note: e.target.value })}
                    placeholder="بۆچی گومانلێکراوە؟ (بۆ نموونە: عنعنة مدلس)"
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          marginTop: 16, padding: 12, borderRadius: 10, background: c.sunken,
          border: `1px dashed ${c.lineNav}`,
        }}
      >
        <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
          <PlusOutlined /> زیادکردنی ڕاوی
        </Text>
        <Space.Compact style={{ width: '100%' }}>
          <Select
            style={{ width: 200 }}
            value={Math.min(insertAt, rows.length)}
            onChange={setInsertAt}
            options={positions}
          />
          <Select
            showSearch
            style={{ flex: 1 }}
            placeholder="گەڕان بەدوای ڕاویدا… (کەمتر نییە لە ٢ پیت)"
            filterOption={false}
            onSearch={search}
            onChange={insert}
            value={null}
            loading={searching}
            notFoundContent={searching ? '…' : null}
            options={hits.map((h) => ({
              value: String(h.id),
              label: (
                <span>
                  <span style={{ ...AMIRI, fontSize: 17.5 }}>{h.shohra || h.name}</span>
                  {h.deathdate && <Text type="secondary" style={{ fontSize: 15 }}> · ت {toAr(h.deathdate)}</Text>}
                </span>
              ),
            }))}
          />
        </Space.Compact>
      </div>
    </Drawer>
  );
}
