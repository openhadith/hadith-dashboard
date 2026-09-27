'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Alert, Button, Card, Col, Empty, Popconfirm, Progress, Row, Space, Statistic, Table, Tag,
  Tooltip, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, DeleteOutlined, ReloadOutlined, WarningFilled } from '@ant-design/icons';
import { useStudio } from './StudioContext';
import { useToast } from './useToast';
import { c, ISSUE, toAr, shell } from '@/lib/tokens';

const { Text, Title } = Typography;

interface Flagged {
  id: number; entity_id: string; status: string;
  snapshot: { matn?: string; bookTitle?: string };
  issue_id: number; type: string; severity: string; detector: string;
}

export default function QualityView({
  summary, byType, flagged, byBook,
}: {
  summary: { total: number; clean: number; open: number; resolved: number };
  byType: Array<{ type: string; count: number; auto: number }>;
  flagged: Flagged[];
  byBook: Array<{ book: string; count: number }>;
}) {
  const router = useRouter();
  const { can } = useStudio();
  const toast = useToast();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const pct = summary.total ? Math.round((summary.clean / summary.total) * 100) : 0;
  const rows = filter ? flagged.filter((f) => f.type === filter) : flagged;
  const bookPeak = Math.max(1, ...byBook.map((b) => b.count));

  const resolve = async (ids: number[]) => {
    if (!ids.length) return;
    setBusy(true);
    const j = await (await fetch('/api/quality', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueIds: ids }),
    })).json();
    setBusy(false);
    if (j.success) {
      toast(`${toAr(j.data.count)} کێشە چارەسەرکرا`);
      setSelected([]);
      router.refresh();
    } else toast(j.error ?? 'سەرکەوتوو نەبوو', 'error');
  };

  const columns: ColumnsType<Flagged> = [
    {
      title: 'کێشە', key: 'type', width: 150,
      render: (_, f) => {
        const t = ISSUE[f.type] ?? ISSUE.unknown;
        return (
          <Space size={6}>
            <Tag style={{ background: t.bg, color: t.fg, border: 'none', marginInlineEnd: 0 }}>{t.label}</Tag>
            {f.severity === 'error' && (
              <Tooltip title="گرنگ"><WarningFilled style={{ color: c.rust }} /></Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'دەق', key: 'matn',
      render: (_, f) => (
        <span
          dir="rtl"
          style={{
            fontFamily: 'var(--font-amiri), serif', fontSize: 17.5,
            display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {f.snapshot?.matn || '—'}
        </span>
      ),
    },
    {
      title: 'سەرچاوە', key: 'book', width: 170, ellipsis: true,
      render: (_, f) => <Text style={{ fontSize: 15, color: c.inkFaint }}>{f.snapshot?.bookTitle ?? '—'}</Text>,
    },
    {
      title: 'دۆزەرەوە', key: 'detector', width: 90,
      render: (_, f) => <Tag>{f.detector === 'auto' ? 'ئۆتۆماتیک' : 'مرۆڤ'}</Tag>,
    },
    {
      title: '', key: 'actions', width: 170,
      render: (_, f) => (
        <Space size={4}>
          <Link href={`/hadith/${f.entity_id}`} style={{ fontSize: 15 }}>کردنەوە</Link>
          {can('edit') && (
            <Button size="small" icon={<CheckOutlined />} disabled={busy} onClick={() => resolve([f.issue_id])}>
              چارەسەر
            </Button>
          )}
        </Space>
      ),
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
          <Title level={4} style={{ margin: 0 }}>جۆری داتا</Title>
          <Space style={{ marginInlineStart: 'auto' }}>
            {selected.length > 0 && (
              <>
                <Text strong style={{ color: c.emerald, fontSize: 16 }}>
                  {toAr(selected.length)} هەڵبژێردراو
                </Text>
                <Button type="primary" icon={<CheckOutlined />} disabled={busy || !can('edit')}
                  onClick={() => resolve(selected)}>
                  چارەسەرکردن
                </Button>
                <Button onClick={() => setSelected([])}>پاشگەزبوونەوە</Button>
              </>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => router.refresh()} />
          </Space>
        </div>

        <div className="surface">
          {/* One headline number. */}
          <Card size="small" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
              <Progress
                type="circle"
                size={96}
                percent={pct}
                strokeColor={c.emerald}
                railColor={c.line}
                format={(p) => (
                  <span style={{ fontSize: 23, fontWeight: 700, color: c.emerald }}>{toAr(p ?? 0)}٪</span>
                )}
              />
              <Row gutter={28} style={{ flex: 1 }}>
                <Col><Statistic title="کۆی ڕەکۆرد" value={toAr(summary.total)} /></Col>
                <Col>
                  <Statistic title="بێ کێشە" value={toAr(summary.clean)} styles={{ content: { color: c.emerald } }} />
                </Col>
                <Col>
                  <Statistic title="کێشەی کراوە" value={toAr(summary.open)} styles={{ content: { color: c.rust } }} />
                </Col>
                <Col>
                  <Statistic title="چارەسەرکراو" value={toAr(summary.resolved)} styles={{ content: { color: c.inkFaint } }} />
                </Col>
              </Row>
            </div>
          </Card>

          {/* Issues by type — each one a way into the work. */}
          <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
            {byType.map((t) => {
              const token = ISSUE[t.type] ?? ISSUE.unknown;
              const active = filter === t.type;
              return (
                <Col key={t.type} flex="1 1 170px">
                  <Card
                    size="small"
                    hoverable
                    onClick={() => setFilter(active ? '' : t.type)}
                    style={{
                      borderInlineStart: `3px solid ${token.dot}`,
                      borderColor: active ? token.fg : undefined,
                    }}
                  >
                    <Statistic
                      title={token.label}
                      value={toAr(t.count)}
                      suffix={
                        <Text style={{ fontSize: 15, color: c.inkGhost }}>
                          {toAr(t.auto)} ئۆتۆماتیک
                        </Text>
                      }
                    />
                  </Card>
                </Col>
              );
            })}
          </Row>

          <Card
            size="small"
            title={filter ? `ڕەکۆردە نیشانکراوەکان · ${ISSUE[filter]?.label}` : 'ڕەکۆردە نیشانکراوەکان'}
            extra={filter ? <Button size="small" type="link" onClick={() => setFilter('')}>لابردنی پاڵاوتن</Button> : null}
            styles={{ body: { padding: 0 } }}
          >
            <Table<Flagged>
              rowKey="issue_id"
              size="small"
              columns={columns}
              dataSource={rows}
              locale={{ emptyText: <Empty description="هیچ کێشەیەکی کراوە نییە" /> }}
              rowSelection={can('edit') ? {
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys as number[]),
              } : undefined}
              pagination={{ pageSize: 15, showSizeChanger: false }}
            />
          </Card>
        </div>
      </div>

      <aside className="side-rail">
        <Card size="small" title="کێشە بەپێی پەرتووک">
          {byBook.map((b) => (
            <div key={b.book} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <Text
                  ellipsis
                  style={{ fontFamily: 'var(--font-amiri), serif', fontSize: 16.5, maxWidth: 190 }}
                >
                  {b.book}
                </Text>
                <Text strong style={{ fontSize: 15 }}>{toAr(b.count)}</Text>
              </div>
              <Progress
                percent={Math.round((b.count / bookPeak) * 100)}
                showInfo={false}
                size="small"
                strokeColor={c.gold}
                railColor={c.line}
                style={{ margin: 0 }}
              />
            </div>
          ))}
        </Card>

        {/* Wide-reaching actions sit apart, and stay inert in this MVP. */}
        <Card size="small" title="کردارە فراوانەکان" style={{ borderColor: '#e8cdc5' }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 10 }}
            title={<span style={{ fontSize: 15 }}>ئەم کردارانە کاریگەری لەسەر هەموو داتاکە دەبێت و لەم نمایشەدا ناچالاککراون.</span>}
          />
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Button block disabled icon={<ReloadOutlined />}>ڕێکخستنەوەی ئیندێکس</Button>
            <Popconfirm title="لە MVPدا ناچالاکە" disabled>
              <Button block danger disabled icon={<DeleteOutlined />}>سڕینەوەی گشتی</Button>
            </Popconfirm>
          </Space>
        </Card>
      </aside>
    </div>
  );
}
