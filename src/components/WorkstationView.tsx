'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Alert, Avatar, Button, Card, Descriptions, Empty, Input, Select, Space, Tag, Timeline, Tooltip,
  Typography,
} from 'antd';
import {
  ArrowRightOutlined, CheckOutlined, CloseOutlined, EditOutlined, ExportOutlined, QuestionOutlined,
  SaveOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useStudio } from './StudioContext';
import { useToast } from './useToast';
import type { CorpusHadith } from '@/lib/corpus';
import type { EditableLink } from '@/lib/isnad';
import IsnadEditor from './IsnadEditor';
import { publicHadithUrl } from '@/lib/site';
import { gradeKeyOf, hukmLabel } from '@/lib/corpus';
import { agoKu, avatarOf, c, GRADE, initials, ISSUE, STATUS, toAr, type Token, shell } from '@/lib/tokens';

const { Text } = Typography;

interface Review {
  id: number; status: string; grade: string | null;
  assignee_id: number | null; assignee_name: string | null; avatar_tone: string | null;
  team_name: string | null; updated_at: string;
  snapshot: { matn?: string; bookTitle?: string; gradeSource?: string };
}

interface Props {
  id: string;
  hadith: CorpusHadith | null;
  /** Collector-first; the studio-edited chain when one exists. */
  chain: EditableLink[];
  chainEdited: boolean;
  chainEditedBy: string | null;
  /** Distinct sanads in the corpus; chain edits publish only when there is one. */
  sanadCount: number;
  /** Unpublished matn, when a draft exists. */
  draftMatn: string | null;
  review: Review | null;
  issues: Array<{ type: string; severity: string; detector: string }>;
  revisions: Array<{ id: number; payload: Record<string, unknown>; note: string | null; created_at: string; author_name: string | null }>;
  users: Array<{ id: number; name: string; avatar_tone: string; role: string }>;
  nextId: string | null;
}

/** A status/grade/issue token as an AntD tag in the studio palette. */
function TokenTag({ token, title }: { token: Token; title?: string }) {
  const tag = (
    <Tag style={{ background: token.bg, color: token.fg, border: 'none', marginInlineEnd: 0 }}>
      {token.label}
    </Tag>
  );
  return title ? <Tooltip title={title}>{tag}</Tooltip> : tag;
}

const AMIRI = { fontFamily: 'var(--font-amiri), serif' } as const;

export default function WorkstationView({
  id, hadith, chain, chainEdited, chainEditedBy, sanadCount, draftMatn, review, issues, revisions, users,
  nextId,
}: Props) {
  const router = useRouter();
  const { can } = useStudio();
  const toast = useToast();

  const [matn, setMatn] = useState(draftMatn ?? hadith?.matn ?? review?.snapshot?.matn ?? '');
  const liveMatn = hadith?.matn ?? null;
  // Unpublished work on this hadith: a text draft or a reordered chain.
  const pending = (draftMatn !== null && draftMatn !== liveMatn) || chainEdited;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isnadOpen, setIsnadOpen] = useState(false);

  const status = STATUS[review?.status ?? 'pending'] ?? STATUS.pending;
  const rawGrade = hadith?.assessments?.[0]?.grades?.[0] ?? null;
  const grade = GRADE[gradeKeyOf(rawGrade ?? hadith?.hukmText)] ?? GRADE.unknown;

  const save = async (nextStatus?: string, thenNext = false) => {
    setBusy(true);
    const j = await (await fetch(`/api/review/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: { matn, bookTitle: hadith?.book?.title ?? review?.snapshot?.bookTitle },
        note: note || null,
        status: nextStatus,
      }),
    })).json();
    setBusy(false);
    if (!j.success) {
      toast(j.error ?? 'پاشەکەوتکردن سەرکەوتوو نەبوو', 'error');
      return;
    }
    setDirty(false);
    setNote('');
    const finalStatus: string | null = j.data?.status ?? nextStatus ?? null;
    toast(
      j.data?.published ? 'پەسەندکرا و بڵاوکرایەوە — لە ماڵپەڕی گشتیدا دەردەکەوێت'
        : finalStatus ? `دۆخ گۆڕدرا بۆ «${STATUS[finalStatus]?.label ?? finalStatus}»`
        : 'ڕەشنووس پاشەکەوت کرا',
    );

    // The primary action closes the loop: save, then straight to the next
    // record, without returning to the list.
    if (thenNext && nextId) router.push(`/hadith/${nextId}`);
    else router.refresh();
  };

  const reassign = async (userId: number) => {
    setBusy(true);
    const j = await (await fetch('/api/queue/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [review?.id], assigneeId: userId }),
    })).json();
    setBusy(false);
    if (j.success) { toast('دابەشکرایەوە'); router.refresh(); }
    else toast(j.error ?? 'سەرکەوتوو نەبوو', 'error');
  };

  // ⌘↵ / Ctrl+↵ is the one-key "save and move on".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (can('edit')) void save(undefined, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matn, note, nextId, can]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* record header */}
        <div
          style={{
            flex: 'none', padding: '14px 32px', background: shell.card,
            borderBottom: `1px solid ${shell.cardBorder}`,
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}
        >
          <Link href="/queue"><Button size="small" type="text" icon={<ArrowRightOutlined />}>ڕیز</Button></Link>
          <Text strong style={{ fontSize: 16.5 }}>
            <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>HDT-{id}</span>
          </Text>
          <TokenTag token={status} />
          <TokenTag token={grade} title={hukmLabel(rawGrade) ?? 'پلە لە سەرچاوەی ڕەسەن'} />
          {issues.map((is, k) => <TokenTag key={k} token={ISSUE[is.type] ?? ISSUE.unknown} />)}
          {hadith?.book?.title && <Text type="secondary" style={{ fontSize: 15 }}>· {hadith.book.title}</Text>}
          {hadith?.hadithid && <Text type="secondary" style={{ fontSize: 15 }}>ژمارە {toAr(hadith.hadithid)}</Text>}
          <Button
            size="small"
            type="link"
            icon={<ExportOutlined />}
            href={publicHadithUrl(id)}
            target="_blank"
            style={{ marginInlineStart: 'auto' }}
          >
            ماڵپەڕی گشتی
          </Button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!hadith && (
            <Alert type="warning" showIcon title="نەتوانرا داتای حەدیس لە API بهێنرێت — دۆخی کار هێشتا دەردەکەوێت." />
          )}

          <Card
            size="small"
            title="دەقی حەدیس (متن)"
            extra={
              dirty ? <Tag color="warning">گۆڕدراوە</Tag>
                : draftMatn !== null && draftMatn !== liveMatn ? (
                  <Tooltip title="ئەم دەقە هێشتا بڵاونەکراوەتەوە؛ پەسەندکردن بڵاوی دەکاتەوە">
                    <Tag color="warning" style={{ marginInlineEnd: 0 }}>ڕەشنووس</Tag>
                  </Tooltip>
                ) : null
            }
            styles={{ body: { padding: 0 } }}
          >
            <Input.TextArea
              value={matn}
              onChange={(e) => { setMatn(e.target.value); setDirty(true); }}
              readOnly={!can('edit')}
              variant="borderless"
              dir="rtl"
              autoSize={{ minRows: 3, maxRows: 10 }}
              style={{ ...AMIRI, fontSize: 19.5, lineHeight: 2, padding: '12px 16px' }}
            />
          </Card>

          <Card
            size="small"
            title="زنجیرەی سەنەد"
            extra={
              <Space size={8}>
                {chainEdited && (
                  <Tooltip title={`ڕەشنووس، هێشتا بڵاونەکراوەتەوە${chainEditedBy ? ` · ${chainEditedBy}` : ''}`}>
                    <Tag color="warning" style={{ marginInlineEnd: 0 }}>ڕەشنووس</Tag>
                  </Tooltip>
                )}
                {sanadCount > 1 && (
                  <Tooltip title="ئەم حەدیسە چەند سەنەدێکی هەیە؛ دەستکاری زنجیرە لێرەوە بڵاو ناکرێتەوە">
                    <Tag style={{ marginInlineEnd: 0 }}>{toAr(sanadCount)} سەنەد</Tag>
                  </Tooltip>
                )}
                <Text type="secondary" style={{ fontSize: 15 }}>{toAr(chain.length)} ڕاوی</Text>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  disabled={!can('edit')}
                  onClick={() => setIsnadOpen(true)}
                >
                  دەستکاری
                </Button>
                <Link href={`/sanad?id=${id}`} style={{ fontSize: 15 }}>پشکنینی سەنەد</Link>
              </Space>
            }
          >
            {chain.length === 0 ? (
              <Empty description="هیچ زنجیرەیەک تۆمار نەکراوە" />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {chain.map((link, i) => {
                  const bio = link.rawy?.bio;
                  const rutba = Number(link.rawy?.Rotba ?? bio?.rutba ?? 0);
                  // Rutba 1–3 are the strongest ranks; the dot is an aid, never the judgement.
                  const dot = rutba && rutba <= 3 ? c.emerald : rutba <= 6 ? c.gold : c.rust;
                  return (
                    <Space key={link.id} size={6}>
                      <Link href={`/narrator/${link.rawyId}`}>
                        <Card size="small" hoverable style={{
                          minWidth: 150, maxWidth: 220, background: link.flagged ? c.rustSoft : c.sunken,
                          borderStyle: link.flagged ? 'dashed' : undefined,
                          borderColor: link.flagged ? c.rust : undefined,
                        }}
                          styles={{ body: { padding: '8px 11px' } }}>
                          <Space size={6}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block' }} />
                            <Text strong ellipsis style={{ ...AMIRI, fontSize: 17.5, maxWidth: 170 }}>
                              {link.rawy?.Shohra || link.rawy?.Name}
                            </Text>
                          </Space>
                          <div>
                            <Text type="secondary" ellipsis style={{ fontSize: 14.5, maxWidth: 190 }}>
                              {bio?.rutba_description ?? ''}
                              {link.rawy?.DeathYear ? ` · ت ${toAr(link.rawy.DeathYear)}` : ''}
                            </Text>
                          </div>
                          {link.flagged && (
                            <Tooltip title={link.note || undefined}>
                              <Tag color="error" icon={<WarningOutlined />} style={{ marginTop: 3 }}>گومانلێکراو</Tag>
                            </Tooltip>
                          )}
                          {(bio?.tadlis || bio?.has_ikhtilat) && (
                            <Space size={4} style={{ marginTop: 3 }}>
                              {bio.tadlis && <Tag color="warning">تدلیس</Tag>}
                              {bio.has_ikhtilat && <Tag color="error">اختلاط</Tag>}
                            </Space>
                          )}
                        </Card>
                      </Link>
                      {i < chain.length - 1 && <Text style={{ color: c.inkPale }}>←</Text>}
                    </Space>
                  );
                })}
              </div>
            )}
          </Card>

          {(hadith?.assessments?.length ?? 0) > 0 && (
            <Card size="small" title="هەڵسەنگاندنەکان" styles={{ body: { padding: '4px 0' } }}>
              {hadith!.assessments!.map((a) => (
                <div key={a.index} style={{ padding: '9px 14px', borderBottom: `1px solid ${c.lineSoft}` }}>
                  <Space size={8} style={{ marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 15 }}>إسناد {toAr(a.index)}</Text>
                    {a.grades.map((g) => (
                      <TokenTag key={g} token={GRADE[gradeKeyOf(g)] ?? GRADE.unknown} title={hukmLabel(g) ?? undefined} />
                    ))}
                    <Text type="secondary" style={{ fontSize: 15 }}>{toAr(a.branches.length)} لق</Text>
                  </Space>
                  {a.sharh && <div style={{ ...AMIRI, fontSize: 17.5, lineHeight: 1.9 }}>{a.sharh}</div>}
                </div>
              ))}
            </Card>
          )}

          {hadith?.full_hadith && (
            <Card size="small" title="دەقی تەواو وەک تۆمارکراوە">
              <div dir="rtl" style={{ ...AMIRI, fontSize: 18, lineHeight: 2 }}>{hadith.full_hadith}</div>
            </Card>
          )}
        </div>

        {/* action bar */}
        <div
          style={{
            flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 32px',
            background: shell.card, borderTop: `1px solid ${shell.cardBorder}`, flexWrap: 'wrap',
          }}
        >
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="هۆکاری گۆڕانکاری (ئارەزوومەندانە)…"
            style={{ flex: 1, maxWidth: 320 }}
          />
          <Tooltip
            title={
              !can('approve') ? 'ڕۆڵەکەت مۆڵەتی پەسەندکردنی نییە'
                : pending || dirty ? 'گۆڕانکارییەکان لە ماڵپەڕی گشتیدا بڵاو دەکرێنەوە'
                : undefined
            }
          >
            <Button type="primary" icon={<CheckOutlined />} disabled={busy || !can('approve')} onClick={() => save('approved')}>
              {pending || dirty ? 'پەسەندکردن و بڵاوکردنەوە' : 'پەسەندکردن'}
            </Button>
          </Tooltip>
          <Tooltip title={can('reject') ? undefined : 'ڕۆڵەکەت مۆڵەتی ڕەتکردنەوەی نییە'}>
            <Button danger icon={<CloseOutlined />} disabled={busy || !can('reject')} onClick={() => save('rejected')}>
              ڕەتکردنەوە
            </Button>
          </Tooltip>
          <Button icon={<QuestionOutlined />} disabled={busy || !can('edit')} onClick={() => save('discuss')}>
            گفتوگۆ
          </Button>

          <Tooltip title={nextId ? '⌘↵ / Ctrl+↵' : undefined}>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              style={{ background: c.gold, borderColor: c.gold, marginInlineStart: 'auto' }}
              loading={busy}
              disabled={!can('edit')}
              onClick={() => save(undefined, true)}
            >
              پاشەکەوت{nextId ? ' → دواتر' : ''}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Mounted only while open, so its working copy starts fresh each time. */}
      {isnadOpen && (
        <IsnadEditor
          hadithId={id}
          links={chain}
          edited={chainEdited}
          sanadCount={sanadCount}
          open
          onClose={() => setIsnadOpen(false)}
          onSaved={() => { setIsnadOpen(false); router.refresh(); }}
        />
      )}

      {/* inspector */}
      <aside className="side-rail">
        <Card size="small" title="دۆخی کار">
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 's', label: 'دۆخ', children: <TokenTag token={status} /> },
              {
                key: 'a', label: 'بەرپرس',
                children: review?.assignee_name ? (
                  <Space size={6}>
                    <Avatar size={20} style={{
                      background: avatarOf(review.avatar_tone).bg, color: avatarOf(review.avatar_tone).fg,
                      fontSize: 13, fontWeight: 600,
                    }}>
                      {initials(review.assignee_name)}
                    </Avatar>
                    <Text style={{ fontSize: 15 }}>{review.assignee_name}</Text>
                  </Space>
                ) : <Text type="secondary">نەدابەشکراو</Text>,
              },
              { key: 't', label: 'تیم', children: review?.team_name ?? '—' },
              { key: 'u', label: 'نوێکردنەوە', children: agoKu(review?.updated_at) },
            ]}
          />
          {can('edit') && review && (
            <Select
              placeholder="دابەشکردنەوە بۆ…"
              style={{ width: '100%', marginTop: 10 }}
              value={null}
              disabled={busy}
              onChange={(v) => reassign(Number(v))}
              options={users.map((u) => ({ value: u.id, label: u.name }))}
            />
          )}
        </Card>

        {hadith?.hukmText && (
          <Card size="small" title="حوکمی تۆمارکراو">
            <div style={{ ...AMIRI, fontSize: 17.5, lineHeight: 1.9 }}>{hadith.hukmText}</div>
          </Card>
        )}

        <Card size="small" title="مێژووی دەستکاری">
          {revisions.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="هێشتا هیچ دەستکارییەک نەکراوە" />
          ) : (
            <Timeline
              items={revisions.map((rv) => ({
                content: (
                  <div>
                    <Text strong style={{ fontSize: 15 }}>{rv.author_name ?? 'سیستەم'}</Text>{' '}
                    <Text type="secondary" style={{ fontSize: 15 }}>{agoKu(rv.created_at)}</Text>
                    {rv.note && <div><Text type="secondary" style={{ fontSize: 15 }}>{rv.note}</Text></div>}
                  </div>
                ),
              }))}
            />
          )}
        </Card>
      </aside>
    </div>
  );
}
