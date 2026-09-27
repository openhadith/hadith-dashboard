'use client';

import Link from 'next/link';
import { Button, Card, Col, Descriptions, Empty, Row, Space, Tag, Typography } from 'antd';
import { ArrowRightOutlined, EditOutlined, ExportOutlined } from '@ant-design/icons';
import { useStudio } from './StudioContext';
import { publicNarratorUrl } from '@/lib/site';
import { toAr } from '@/lib/tokens';

const { Title, Paragraph } = Typography;
const AMIRI = { fontFamily: 'var(--font-amiri), serif' } as const;

export default function NarratorProfileView({
  id, narrator,
}: {
  id: string;
  narrator: Record<string, unknown> | null;
}) {
  const { can } = useStudio();

  if (!narrator) {
    return <div style={{ padding: 40 }}><Empty description="ڕاوی نەدۆزرایەوە" /></div>;
  }

  const str = (k: string) => (narrator[k] == null || narrator[k] === '' ? null : String(narrator[k]));
  const num = (k: string) => (str(k) ? toAr(str(k)!) : null);

  const facts = [
    ['کونیە', str('kunya')],
    ['لەقەب', str('laqab')],
    ['نەسەب', str('nasab')],
    ['مەزهەب', str('mazhab')],
    ['پلە', str('rutba_description')],
    ['تەبەقە', num('tabaqah')],
    ['شوێنی لەدایکبوون', str('birth_country')],
    ['شوێنی وەفات', str('death_country')],
    ['ساڵی وەفات', num('deathdate')],
    ['ڕەگەز', str('gender')],
  ].filter(([, v]) => v) as Array<[string, string]>;

  return (
    <div className="surface">
      <Space style={{ marginBottom: 14, width: '100%' }} wrap>
        <Link href="/narrators">
          <Button size="small" type="text" icon={<ArrowRightOutlined />}>ڕاویان</Button>
        </Link>
        <Title level={3} style={{ ...AMIRI, margin: 0 }}>{str('shohra') || str('name') || '—'}</Title>
        {narrator.tadlis ? <Tag color="warning">تدلیس</Tag> : null}
        {narrator.has_ikhtilat ? <Tag color="error">اختلاط</Tag> : null}
      </Space>

      <Space style={{ marginBottom: 14 }}>
        {/* Editing goes through the CRUD screen, which stores an override
            rather than touching the corpus record. */}
        <Link href={`/narrators?q=${encodeURIComponent(str('shohra') ?? str('name') ?? '')}`}>
          <Button icon={<EditOutlined />} disabled={!can('edit')}>دەستکاری</Button>
        </Link>
        <Button icon={<ExportOutlined />} href={publicNarratorUrl(id)} target="_blank">ماڵپەڕی گشتی</Button>
      </Space>

      <Row gutter={[14, 14]}>
        <Col xs={24} lg={15}>
          <Card size="small" title="ناوی تەواو">
            <div style={{ ...AMIRI, fontSize: 21, lineHeight: 2 }}>{str('name') ?? '—'}</div>
            {str('description') && <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>{str('description')}</Paragraph>}
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card size="small" title="زانیاری">
            {facts.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="زانیاری زیاتر نییە" />
            ) : (
              <Descriptions
                size="small"
                column={1}
                items={facts.map(([label, value]) => ({ key: label, label, children: value }))}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
