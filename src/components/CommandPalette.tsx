'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Empty, Input, Modal, Spin, Typography, type InputRef } from 'antd';
import {
  BookOutlined, EnterOutlined, ReadOutlined, SearchOutlined, UserOutlined,
} from '@ant-design/icons';
import { c, toAr, shell } from '@/lib/tokens';

const { Text } = Typography;
const AMIRI = { fontFamily: 'var(--font-amiri), serif' } as const;

export interface PaletteCommand { key: string; label: string; icon: ReactNode }

interface Item {
  id: string;
  group: string;
  icon: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  href: string;
}

interface Hits {
  hadiths: Array<{ id: string; matn?: string }>;
  narrators: Array<{ id: string; name?: string; shohra?: string; deathdate?: string }>;
  books: Array<{ id: string; title?: string; author_name?: string }>;
}

const EMPTY: Hits = { hadiths: [], narrators: [], books: [] };

/**
 * Ctrl/⌘ K palette — the comps' fastest route around the studio.
 *
 * Three sources, in the order a reviewer most often wants them: a direct jump
 * when the query is a hadith id, the studio's own screens, then corpus search
 * (hadiths, narrators, books) from the live index. Fully keyboard-driven:
 * ↑↓ to move, Enter to open, Esc to close.
 */
export default function CommandPalette({ commands }: { commands: PaletteCommand[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hits>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<InputRef>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounced corpus search; stale responses are dropped.
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2 || /^(hdt-?)?\d+$/i.test(term)) {
      return;
    }
    let alive = true;
    const controller = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/corpus?kind=all&q=${encodeURIComponent(term)}&limit=6`, { signal: controller.signal })
        .then((r) => r.json())
        .then((j) => { if (alive) setHits(j.success ? j.data : EMPTY); })
        .catch(() => {})
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); controller.abort(); };
  }, [q, open]);

  const items = useMemo<Item[]>(() => {
    const term = q.trim();
    const out: Item[] = [];

    const idMatch = term.match(/^(?:hdt-?)?(\d+)$/i);
    if (idMatch) {
      out.push({
        id: `jump-${idMatch[1]}`,
        group: 'ڕاستەوخۆ',
        icon: <EnterOutlined />,
        title: <span>کردنەوەی <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>HDT-{idMatch[1]}</span></span>,
        href: `/hadith/${idMatch[1]}`,
      });
    }

    const lower = term.toLowerCase();
    for (const cmd of commands) {
      if (!term || cmd.label.toLowerCase().includes(lower)) {
        out.push({ id: `nav-${cmd.key}`, group: 'بڕۆ بۆ', icon: cmd.icon, title: cmd.label, href: cmd.key });
      }
    }

    if (term.length >= 2 && !idMatch) {
      for (const h of hits.hadiths) {
        out.push({
          id: `h-${h.id}`, group: 'حەدیس', icon: <ReadOutlined />,
          title: <span style={{ ...AMIRI, fontSize: 17.5 }}>{(h.matn ?? '').slice(0, 90)}</span>,
          hint: <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>HDT-{h.id}</span>,
          href: `/hadith/${h.id}`,
        });
      }
      for (const n of hits.narrators) {
        out.push({
          id: `n-${n.id}`, group: 'ڕاوی', icon: <UserOutlined />,
          title: <span style={{ ...AMIRI, fontSize: 17.5 }}>{n.shohra || n.name}</span>,
          hint: n.deathdate ? `ت ${toAr(n.deathdate)}` : undefined,
          href: `/narrator/${n.id}`,
        });
      }
      for (const b of hits.books) {
        out.push({
          id: `b-${b.id}`, group: 'پەرتووک', icon: <BookOutlined />,
          title: <span style={{ ...AMIRI, fontSize: 17.5 }}>{b.title}</span>,
          hint: b.author_name,
          href: `/books?q=${encodeURIComponent(b.title ?? '')}`,
        });
      }
    }
    return out;
  }, [q, commands, hits]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[cursor]); }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  let lastGroup = '';

  return (
    <>
      {/* The top-bar trigger, as in the comps. */}
      <button
        onClick={() => setOpen(true)}
        style={{
          width: 'min(520px, 100%)', height: 38, display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 12px', background: c.raised, border: `1px solid ${c.lineNav}`, borderRadius: 8,
          color: c.inkDim, fontSize: 16, fontFamily: 'inherit', cursor: 'pointer',
          // AntD's Layout.Header sets line-height to the full header height;
          // without this the kbd badge inherits 54px and grows into a column.
          lineHeight: 1.4,
        }}
      >
        <SearchOutlined style={{ opacity: 0.7 }} />
        <span style={{ flex: 1, textAlign: 'start' }}>گەڕان لە حەدیس، ڕاوی، پەرتووک، شاشەکان…</span>
        <kbd
          dir="ltr"
          style={{
            fontSize: 14.5, padding: '2px 6px', border: `1px solid ${c.line}`, borderRadius: 4,
            background: c.sunken, fontFamily: 'inherit',
          }}
        >
          Ctrl K
        </kbd>
      </button>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        closable={false}
        width={620}
        style={{ top: 80 }}
        styles={{ body: { padding: 0 } }}
        destroyOnHidden
        afterOpenChange={(v) => {
          if (v) { setQ(''); setHits(EMPTY); setCursor(0); inputRef.current?.focus(); }
        }}
      >
        <div style={{ padding: 12, borderBottom: `1px solid ${c.lineSoft}` }}>
          <Input
            ref={inputRef}
            size="large"
            variant="borderless"
            prefix={loading ? <Spin size="small" /> : <SearchOutlined style={{ color: c.inkFaint }} />}
            placeholder="بنووسە… (ژمارەی حەدیس، ناوی ڕاوی، دەق، ناوی شاشە)"
            value={q}
            onChange={(e) => { setQ(e.target.value); setCursor(0); if (e.target.value.trim().length < 2) setHits(EMPTY); }}
            onKeyDown={onInputKey}
          />
        </div>

        <div ref={listRef} style={{ maxHeight: 420, overflowY: 'auto', padding: 6 }}>
          {items.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? '…' : 'هیچ ئەنجامێک نییە'} />
          ) : (
            items.map((it, i) => {
              const header = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              const active = i === cursor;
              return (
                <div key={it.id}>
                  {header && (
                    <div style={{ padding: '8px 10px 4px', fontSize: 15, fontWeight: 700, color: c.inkGhost }}>
                      {header}
                    </div>
                  )}
                  <div
                    data-i={i}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(it)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      borderRadius: 8, cursor: 'pointer',
                      background: active ? c.emeraldSoft : 'transparent',
                    }}
                  >
                    <span style={{ color: active ? c.emerald : c.inkFaint, width: 16 }}>{it.icon}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: c.ink }}>
                      {it.title}
                    </span>
                    {it.hint && <Text type="secondary" style={{ fontSize: 15, flex: 'none' }}>{it.hint}</Text>}
                    {active && <EnterOutlined style={{ color: c.emerald, fontSize: 15 }} />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            display: 'flex', gap: 14, padding: '7px 14px', borderTop: `1px solid ${c.lineSoft}`,
            background: shell.card, fontSize: 15, color: c.inkFaint, borderRadius: '0 0 11px 11px',
          }}
        >
          <span>↑↓ گەڕان</span><span>Enter کردنەوە</span><span>Esc داخستن</span>
        </div>
      </Modal>
    </>
  );
}
