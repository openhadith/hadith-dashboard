'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Button, Card, Col, Empty, Input, Popconfirm, Progress, Row, Space, Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CopyOutlined, SwapOutlined } from '@ant-design/icons';
import { useStudio } from './StudioContext';
import { useToast } from './useToast';
import type { CorpusHadith } from '@/lib/corpus';
import { diffWords, type DiffOp } from '@/lib/diff';
import { c, toAr, shell } from '@/lib/tokens';

const { Text, Title, Paragraph } = Typography;

interface FieldRow { label: string; a: string | null; b: string | null }

export default function CompareView({
  idA, idB, a, b,
}: {
  idA: string | null; idB: string | null;
  a: CorpusHadith | null; b: CorpusHadith | null;
}) {
  const router = useRouter();
  const { can } = useStudio();
  const toast = useToast();
  const [fa, setFa] = useState(idA ?? '');
  const [fb, setFb] = useState(idB ?? '');
  const [busy, setBusy] = useState(false);

  const diff = useMemo(() => diffWords(a?.matn ?? '', b?.matn ?? ''), [a?.matn, b?.matn]);

  const verdict =
    diff.similarity > 85
      ? { color: c.rust, text: 'ڕێژەی بەرز — بە ئەگەرێکی زۆر دووبارەن.' }
      : diff.similarity > 60
        ? { color: c.goldFg, text: 'هاوشێوەن بەڵام جیاوازی بەرچاو هەیە — پێویستی بە پێداچوونەوە هەیە.' }
        : { color: c.emerald, text: 'جیاوازن — بە ئەگەری کەم دووبارەن.' };

  const go = () => {
    if (fa.trim() && fb.trim()) router.push(`/compare?a=${fa.trim()}&b=${fb.trim()}`);
  };

  const markDuplicate = async () => {
    if (!idA) return;
    setBusy(true);
    const j = await (await fetch('/api/queue/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityIds: [idA], status: 'duplicate', reason: `دووبارە لەگەڵ HDT-${idB}` }),
    })).json();
    setBusy(false);
    if (j.success) { toast('نیشانکرا وەک دووبارە'); router.refresh(); }
    else toast(j.error ?? 'سەرکەوتوو نەبوو', 'error');
  };

  const fields: FieldRow[] = [
    { label: 'پەرتووک', a: a?.book?.title ?? null, b: b?.book?.title ?? null },
    { label: 'ژمارەی حەدیس', a: a?.hadithid ? toAr(a.hadithid) : null, b: b?.hadithid ? toAr(b.hadithid) : null },
    { label: 'جۆر', a: a?.type ?? null, b: b?.type ?? null },
    { label: 'لاپەڕە', a: a?.pageNo ? toAr(a.pageNo) : null, b: b?.pageNo ? toAr(b.pageNo) : null },
    {
      label: 'ژمارەی ڕاوی',
      a: toAr(a?.hadith_has_rawy?.length ?? 0), b: toAr(b?.hadith_has_rawy?.length ?? 0),
    },
  ];

  const fieldColumns: ColumnsType<FieldRow> = [
    { title: 'A', dataIndex: 'a', key: 'a', render: (v) => v ?? <Text type="secondary">—</Text> },
    {
      title: 'خانە', key: 'label', width: 150, align: 'center',
      render: (_, r) => {
        const same = (r.a ?? '') === (r.b ?? '');
        const onlyOne = !r.a !== !r.b;
        return (
          <Tag color={onlyOne ? 'error' : same ? 'success' : 'warning'} style={{ marginInlineEnd: 0 }}>
            {r.label}
          </Tag>
        );
      },
    },
    { title: 'B', dataIndex: 'b', key: 'b', align: 'end', render: (v) => v ?? <Text type="secondary">—</Text> },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          flex: 'none', padding: '18px 32px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: `1px solid ${shell.cardBorder}`, flexWrap: 'wrap',
        }}
      >
        <Title level={4} style={{ margin: 0 }}>بەراورد</Title>
        <Space style={{ marginInlineStart: 'auto' }}>
          <Input value={fa} onChange={(e) => setFa(e.target.value)} onPressEnter={go}
            placeholder="A" dir="ltr" style={{ width: 120 }} />
          <SwapOutlined style={{ color: c.inkPale }} />
          <Input value={fb} onChange={(e) => setFb(e.target.value)} onPressEnter={go}
            placeholder="B" dir="ltr" style={{ width: 120 }} />
          <Button type="primary" onClick={go}>بەراوردکردن</Button>
        </Space>
      </div>

      {!a || !b ? (
        <div style={{ padding: 40 }}><Empty description="دوو ژمارەی حەدیس بنووسە بۆ بەراوردکردنیان" /></div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card size="small">
            <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
              <Progress
                type="dashboard"
                size={92}
                percent={diff.similarity}
                strokeColor={verdict.color}
                railColor={c.line}
                format={(p) => (
                  <span style={{ fontSize: 23, fontWeight: 700, color: verdict.color }}>{toAr(p ?? 0)}٪</span>
                )}
              />
              <div style={{ flex: 1, minWidth: 220 }}>
                <Text strong style={{ fontSize: 16.5 }}>هاوشێوەیی</Text>
                <Paragraph type="secondary" style={{ margin: '2px 0 0', fontSize: 15 }}>
                  {verdict.text} بەراورد لەسەر وشەی ڕێکخراو دەکرێت، نەک دەقی خاو — جیاوازی تەشکیل و
                  شێوەی ئەلیف وەک جیاوازی ناژمێردرێت.
                </Paragraph>
              </div>
              {can('merge') && (
                <Popconfirm
                  title="نیشانکردنی A وەک دووبارە؟"
                  description="A دەچێتە دۆخی «دووبارە» لە ڕیزی پەسەندکردن."
                  okText="بەڵێ"
                  cancelText="نەخێر"
                  onConfirm={markDuplicate}
                >
                  <Button danger icon={<CopyOutlined />} loading={busy}>نیشانکردنی A وەک دووبارە</Button>
                </Popconfirm>
              )}
            </div>
          </Card>

          <Row gutter={12}>
            <Col xs={24} lg={12}>
              <Card size="small" style={{ borderInlineStart: `3px solid ${c.blue}` }}
                title={<span>A · <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>HDT-{idA}</span></span>}>
                <DiffText ops={diff.a} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" style={{ borderInlineStart: `3px solid ${c.gold}` }}
                title={<span>B · <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>HDT-{idB}</span></span>}>
                <DiffText ops={diff.b} />
              </Card>
            </Col>
          </Row>

          <Card size="small" title="بەراوردی خانە بە خانە" styles={{ body: { padding: 0 } }}>
            <Table<FieldRow> rowKey="label" size="small" columns={fieldColumns} dataSource={fields} pagination={false} />
          </Card>
        </div>
      )}
    </div>
  );
}

function DiffText({ ops }: { ops: DiffOp[] }) {
  return (
    <p dir="rtl" style={{ margin: 0, fontFamily: 'var(--font-amiri), serif', fontSize: 18.5, lineHeight: 2.1, color: c.inkStrong }}>
      {ops.map((op, i) => (
        <span
          key={i}
          style={
            op.type === 'same'
              ? undefined
              : {
                  background: op.type === 'add' ? c.emeraldTint : c.rustSoft,
                  color: op.type === 'add' ? c.emerald : c.rust,
                  borderRadius: 4, padding: '1px 3px',
                }
          }
        >
          {op.text}
          {i < ops.length - 1 ? ' ' : ''}
        </span>
      ))}
    </p>
  );
}
