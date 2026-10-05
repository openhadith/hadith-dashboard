'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Tag, Typography } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { c, ROLE_LABEL, shell } from '@/lib/tokens';

const { Title, Text } = Typography;

/** Local accounts created by the API's `npm run dev:db`. Never shown in production. */
const DEV_ACCOUNTS: Array<[string, string]> = [
  ['zana@muhaqqiq.org', 'supervisor'],
  ['ahmad@muhaqqiq.org', 'muhaqqiq'],
  ['soran@muhaqqiq.org', 'editor'],
  ['sara@muhaqqiq.org', 'reviewer'],
  ['rebin@muhaqqiq.org', 'viewer'],
];
const DEV_PASSWORD = 'hadith-dev';

export default function LoginView({ dev, apiWarning }: { dev: boolean; apiWarning?: string | null }) {
  const params = useSearchParams();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ email: string; password: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async ({ email, password }: { email: string; password: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const j = await res.json();
      if (!j.success) {
        setError(j.error ?? 'چوونەژوورەوە سەرکەوتوو نەبوو');
        setBusy(false);
        return;
      }
      message.success(`بەخێربێیت، ${j.data.user.name}`);

      // Only same-origin absolute paths are honoured (a leading `//` would be
      // protocol-relative), so `next` cannot bounce someone off-site.
      const next = params.get('next');
      const dest = next && /^\/(?!\/)/.test(next) ? next : '/';

      // Full reload so every server component re-renders under the new identity.
      window.location.href = dest;
    } catch {
      setError('هەڵەیەک ڕوویدا');
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24, background: shell.canvas, overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 10, background: c.emerald, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-amiri), serif', fontWeight: 700, fontSize: 28,
            }}
          >
            ح
          </div>
          <div style={{ lineHeight: 1.25 }}>
            <Title level={4} style={{ margin: 0, color: c.inkStrong }}>
              دەزگای پەسەندکردنی حەدیس
            </Title>
            <Text style={{ fontSize: 15, color: c.inkDim }}>
              Muhaqqiq · وۆرک‌ستەیشنی بەڕێوەبردن
            </Text>
          </div>
        </div>

        {apiWarning && (
          <Alert
            type="warning"
            showIcon
            title="پەیوەندی بە API ـی حەدیس نەکرا"
            description={
              <span style={{ fontSize: 15, lineHeight: 1.8 }}>
                چوونەژوورەوە کار ناکات تا <code dir="ltr">NEXT_PUBLIC_API_URL</code> ئاماژە بە
                API یەکی گەیشتوو بکات. ئێستا: <code dir="ltr">{apiWarning}</code>
              </span>
            }
          />
        )}

        <Card styles={{ body: { padding: 22 } }}>
          <Form form={form} layout="vertical" onFinish={signIn} requiredMark={false} disabled={busy}>
            <Form.Item
              name="email"
              label="ئیمەیل"
              rules={[{ required: true, message: 'ئیمەیل بنووسە' }, { type: 'email', message: 'ئیمەیلێکی دروست بنووسە' }]}
            >
              <Input prefix={<MailOutlined />} dir="ltr" autoComplete="username" autoFocus />
            </Form.Item>
            <Form.Item
              name="password"
              label="وشەی نهێنی"
              rules={[{ required: true, message: 'وشەی نهێنی بنووسە' }]}
            >
              <Input.Password prefix={<LockOutlined />} dir="ltr" autoComplete="current-password" />
            </Form.Item>
            {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
            <Button type="primary" htmlType="submit" block loading={busy}>
              چوونەژوورەوە
            </Button>
          </Form>
        </Card>

        {dev && (
          <Card size="small" title="هەژمارەکانی گەشەپێدان" styles={{ body: { padding: 12 } }}>
            <Text type="secondary" style={{ fontSize: 15 }}>
              تەنها لە ژینگەی ناوخۆیی. وشەی نهێنی: <code dir="ltr">{DEV_PASSWORD}</code>
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {DEV_ACCOUNTS.map(([email, role]) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => form.setFieldsValue({ email, password: DEV_PASSWORD })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '6px 10px', borderRadius: 8, border: `1px solid ${c.lineCard}`,
                    background: c.raised, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <Text dir="ltr" style={{ fontSize: 15 }}>{email}</Text>
                  <Tag style={{ marginInlineEnd: 0 }}>{ROLE_LABEL[role] ?? role}</Tag>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Text style={{ fontSize: 15, color: c.inkGhost, textAlign: 'center' }}>
          هەژمارەکان لەلایەن بەڕێوەبەرەوە دروست دەکرێن. دەستکارییەکان تەنها دوای پەسەندکردن
          لە ماڵپەڕی گشتیدا دەردەکەون.
        </Text>
      </div>
    </div>
  );
}
