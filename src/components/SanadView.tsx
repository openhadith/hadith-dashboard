'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Alert, Button, Card, Descriptions, Empty, Input, Space, Steps, Tag, Tooltip, Typography,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { CorpusHadith } from '@/lib/corpus';
import type { EditableLink } from '@/lib/isnad';
import { gradeKeyOf, hukmLabel } from '@/lib/corpus';
import { c, GRADE, toAr, shell } from '@/lib/tokens';

const { Text, Title } = Typography;
const AMIRI = { fontFamily: 'var(--font-amiri), serif' } as const;

/**
 * Sanad explorer.
 *
 * The chain runs top-down, source first: the Companion nearest the Prophet at
 * the top and the collector at the bottom — the order in which a chain is read
 * aloud, and the one in which branching becomes legible.
 */
export default function SanadView({
  id, hadith, chain, chainEdited = false,
}: {
  id: string | null;
  hadith: CorpusHadith | null;
  chain: EditableLink[];
  chainEdited?: boolean;
}) {
  const router = useRouter();
  const [lookup, setLookup] = useState(id ?? '');
  const [focus, setFocus] = useState<string | null>(null);

  // `orderChain` returns collector-first; display inverts it so the source leads.
  const ordered = [...chain].reverse();

  // A narrator that several assessment branches pass through is the chain's
  // pivot — the madar al-isnad.
  const branchCounts = new Map<string, number>();
  for (const a of hadith?.assessments ?? []) {
    for (const b of a.branches) {
      for (const n of b.distinctNarrators) branchCounts.set(n.id, (branchCounts.get(n.id) ?? 0) + 1);
    }
  }
  const madar = new Set([...branchCounts.entries()].filter(([, n]) => n > 1).map(([nid]) => nid));

  const selected = ordered.find((l) => l.rawyId === focus) ?? null;
  const bio = selected?.rawy?.bio;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          style={{
            flex: 'none', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
            borderBottom: `1px solid ${shell.cardBorder}`, flexWrap: 'wrap',
          }}
        >
          <Title level={4} style={{ margin: 0 }}>پشکنینی سەنەد</Title>
          {id && (
            <Text type="secondary" style={{ fontSize: 15 }}>
              <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>HDT-{id}</span>
            </Text>
          )}
          <Space.Compact style={{ marginInlineStart: 'auto' }}>
            <Input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onPressEnter={() => lookup.trim() && router.push(`/sanad?id=${lookup.trim()}`)}
              placeholder="ژمارەی حەدیس…"
              dir="ltr"
              style={{ width: 160 }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => lookup.trim() && router.push(`/sanad?id=${lookup.trim()}`)}
            >
              پیشاندان
            </Button>
          </Space.Compact>
        </div>

        <div className="surface">
          {!hadith ? (
            <Empty description="ژمارەیەکی حەدیس بنووسە بۆ پیشاندانی زنجیرەکەی" />
          ) : (
            <>
              <Card size="small" title="دەقی حەدیس" style={{ marginBottom: 16 }}>
                <div dir="rtl" style={{ ...AMIRI, fontSize: 19.5, lineHeight: 2 }}>{hadith.matn ?? '—'}</div>
                {hadith.book?.title && (
                  <Text type="secondary" style={{ fontSize: 15 }}>
                    {hadith.book.title}{hadith.hadithid ? ` · ژمارە ${toAr(hadith.hadithid)}` : ''}
                  </Text>
                )}
              </Card>

              {ordered.length === 0 ? (
                <Empty description="زنجیرەی ڕاویان بۆ ئەم حەدیسە تۆمار نەکراوە" />
              ) : (
                <Card
                  size="small"
                  title={`زنجیرە · ${toAr(ordered.length)} ڕاوی`}
                  extra={
                    <Space size={6}>
                      {chainEdited && <Tag color="warning" style={{ marginInlineEnd: 0 }}>دەستکاریکراو</Tag>}
                      {id && <Link href={`/hadith/${id}`} style={{ fontSize: 15 }}>دەستکاری زنجیرە</Link>}
                    </Space>
                  }
                >
                  <Steps
                    orientation="vertical"
                    size="small"
                    current={-1}
                    style={{ maxWidth: 560, marginInline: 'auto' }}
                    items={ordered.map((link, i) => {
                      const b = link.rawy?.bio;
                      const rutba = Number(link.rawy?.Rotba ?? b?.rutba ?? 0);
                      const dot = rutba && rutba <= 3 ? c.emerald : rutba <= 6 ? c.gold : c.rust;
                      const isMadar = madar.has(link.rawyId);
                      const isFocus = focus === link.rawyId;
                      return {
                        icon: (
                          <span style={{
                            width: 12, height: 12, borderRadius: '50%', background: dot, display: 'inline-block',
                            boxShadow: isFocus ? `0 0 0 4px ${c.emeraldSoft}` : undefined,
                          }} />
                        ),
                        title: (
                          <button
                            onClick={() => setFocus(isFocus ? null : link.rawyId)}
                            style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              fontFamily: 'inherit', textAlign: 'start',
                            }}
                          >
                            <Space size={6} wrap>
                              <Text strong style={{ ...AMIRI, fontSize: 18.5, color: isFocus ? c.emerald : c.inkStrong }}>
                                {link.rawy?.Shohra || link.rawy?.Name}
                              </Text>
                              {i === 0 && <Tag color="success">سەرچاوە</Tag>}
                              {i === ordered.length - 1 && <Tag>کۆکەرەوە</Tag>}
                              {isMadar && (
                                <Tooltip title="ڕاوییەک کە چەند لقێکی زنجیرە پێیدا تێدەپەڕن">
                                  <Tag color="gold">مدار الإسناد</Tag>
                                </Tooltip>
                              )}
                              {b?.tadlis && <Tag color="error">تدلیس</Tag>}
                              {link.flagged && <Tag color="error">گومانلێکراو</Tag>}
                            </Space>
                          </button>
                        ),
                        content: (
                          <>
                            <Text type="secondary" style={{ fontSize: 15 }}>
                              {b?.rutba_description ?? ''}
                              {link.rawy?.DeathYear ? ` · ت ${toAr(link.rawy.DeathYear)}` : ''}
                            </Text>
                            {link.flagged && link.note && (
                              <div><Text style={{ fontSize: 15, color: c.rust }}>{link.note}</Text></div>
                            )}
                          </>
                        ),
                      };
                    })}
                  />
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <aside className="side-rail">
        {selected ? (
          <Card size="small" title="ڕاوی هەڵبژێردراو"
            extra={<Link href={`/narrator/${selected.rawyId}`} style={{ fontSize: 15 }}>پرۆفایل</Link>}>
            <div style={{ ...AMIRI, fontSize: 18.5, marginBottom: 8 }}>{selected.rawy?.Shohra || selected.rawy?.Name}</div>
            <Descriptions
              size="small"
              column={1}
              items={[
                bio?.kunya && { key: 'k', label: 'کونیە', children: bio.kunya },
                bio?.laqab && { key: 'l', label: 'لەقەب', children: bio.laqab },
                bio?.mazhab && { key: 'm', label: 'مەزهەب', children: bio.mazhab },
                bio?.rutba_description && { key: 'r', label: 'پلە', children: bio.rutba_description },
                selected.rawy?.DeathYear && { key: 'd', label: 'ساڵی وەفات', children: toAr(selected.rawy.DeathYear) },
              ].filter(Boolean) as Array<{ key: string; label: string; children: React.ReactNode }>}
            />
          </Card>
        ) : (
          <Alert
            type="info"
            showIcon
            title="ڕێنمایی"
            description={
              <span style={{ fontSize: 15, lineHeight: 1.9 }}>
                کرتە لەسەر ڕاوییەک بکە بۆ بینینی زانیارییەکانی. زنجیرە لە سەرەوە (نزیکترین
                بە پێغەمبەر) بەرەو خوارەوە (کۆکەرەوە) دەخوێنرێتەوە.
              </span>
            }
          />
        )}

        {(hadith?.assessments?.length ?? 0) > 0 && (
          <Card size="small" title="هەڵسەنگاندنەکان" styles={{ body: { padding: '4px 0' } }}>
            {hadith!.assessments!.map((a) => (
              <div key={a.index} style={{ padding: '8px 12px', borderBottom: `1px solid ${c.lineSoft}` }}>
                <Space size={6} style={{ marginBottom: 3 }}>
                  <Text strong style={{ fontSize: 15 }}>إسناد {toAr(a.index)}</Text>
                  {a.grades.map((g) => {
                    const t = GRADE[gradeKeyOf(g)] ?? GRADE.unknown;
                    return (
                      <Tooltip key={g} title={hukmLabel(g) ?? undefined}>
                        <Tag style={{ background: t.bg, color: t.fg, border: 'none' }}>{t.label}</Tag>
                      </Tooltip>
                    );
                  })}
                </Space>
                {a.sharh && <div style={{ ...AMIRI, fontSize: 16.5, lineHeight: 1.8 }}>{a.sharh}</div>}
              </div>
            ))}
          </Card>
        )}

        {hadith?.hukmText && (
          <Card size="small" title="حوکمی تۆمارکراو">
            <div style={{ ...AMIRI, fontSize: 17, lineHeight: 1.9 }}>{hadith.hukmText}</div>
          </Card>
        )}
      </aside>
    </div>
  );
}
