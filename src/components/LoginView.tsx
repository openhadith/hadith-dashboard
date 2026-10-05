'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, App, Avatar, Button, Card, Form, Input, Tag, Typography } from 'antd';
import { EyeOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { avatarOf, c, initials, ROLE_LABEL, shell } from '@/lib/tokens';

const { Title, Text } = Typography;

interface Account {
  id: number; name: string; email: string; role: string; avatar_tone: string; status: string;
}

/** Local accounts created by the API's `npm run dev:db`. */
const DEV_ACCOUNTS: Array<[string, string]> = [
  ['zana@muhaqqiq.org', 'supervisor'],
  ['ahmad@muhaqqiq.org', 'muhaqqiq'],
  ['soran@muhaqqiq.org', 'editor'],
  ['sara@muhaqqiq.org', 'reviewer'],
  ['rebin@muhaqqiq.org', 'viewer'],
];
const DEV_PASSWORD = 'hadith-dev';

const ROLE_COLOR: Record<string, string> = {
  supervisor: c.emerald, muhaqqiq: c.blue, editor: c.goldFg, reviewer: c.plum, viewer: c.inkFaint,
};

export default function LoginView({
  dev, apiWarning, localSignin = false, readOnly = false, accounts = [],
}: {
  dev: boolean;
  apiWarning?: string | null;
  localSignin?: boolean;
  readOnly?: boolean;
  accounts?: Account[];
}) {
  const params = useSearchParams();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ email: string; password: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (body: Record<string, unknown>, busyKey: string) => {
    setBusy(busyKey);
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) {
        setError(j.error ?? 'چوونەژوورەوە سەرکەوتوو نەبوو');
        setBusy(null);
        return;
      }
      message.success(`بەخێربێیت، ${j.data.user.name}`);

      // Only same-origin absolute paths are honoured (a leading `//` would be
      // protocol-relative), so `next` cannot bounce someone off-site.
      const next = params.get('next');
      const dest = next && /^\/(?!\/)/.test(next) ? next : '/';

      // Full reload so every server component re-renders under the new identity.
      window.location.assign(dest);
    } catch {
      setError('هەڵەیەک ڕوویدا');
      setBusy(null);
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

        {readOnly && (
          <Alert
            type="info"
            showIcon
            icon={<EyeOutlined />}
            title="دۆخی خوێندنەوە"
            description={
              <span style={{ fontSize: 15, lineHeight: 1.8 }}>
                هەموو شاشەکان دەکرێنەوە، بەڵام هیچ گۆڕانکارییەک پاشەکەوت ناکرێت و
                هیچ شتێک ناگاتە ماڵپەڕی گشتی.
              </span>
            }
          />
        )}

        {apiWarning && (
          <Alert
            type="warning"
            showIcon
            title={localSignin ? 'دەقی حەدیس نەهێنرایەوە' : 'پەیوەندی بە API ـی حەدیس نەکرا'}
            description={
              <span style={{ fontSize: 15, lineHeight: 1.8 }}>
                {localSignin
                  ? 'چوونەژوورەوە کار دەکات، بەڵام دەقی حەدیس نیشان نادرێت تا '
                  : 'چوونەژوورەوە کار ناکات تا '}
                <code dir="ltr">NEXT_PUBLIC_API_URL</code> ئاماژە بە API یەکی گەیشتوو بکات.
                ئێستا: <code dir="ltr">{apiWarning}</code>
              </span>
            }
          />
        )}

        {localSignin ? (
          <Card
            title="هەژمارێک هەڵبژێرە"
            styles={{ body: { padding: 12 } }}
            extra={<Text type="secondary" style={{ fontSize: 15 }}>بێ وشەی نهێنی</Text>}
          >
            {accounts.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                title="هیچ هەژمارێک نییە"
                description={
                  <span style={{ fontSize: 15, lineHeight: 1.8 }}>
                    داتابەیسی دەزگاکە بەتاڵە. <code dir="ltr">npm run db:seed</code> جێبەجێ بکە.
                  </span>
                }
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {accounts.map((a) => {
                  const tone = avatarOf(a.avatar_tone);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => send({ userId: a.id }, String(a.id))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'start',
                        padding: '9px 11px', borderRadius: 9, border: `1px solid ${c.lineCard}`,
                        borderInlineStart: `3px solid ${ROLE_COLOR[a.role] ?? c.inkFaint}`,
                        background: c.raised, fontFamily: 'inherit',
                        cursor: busy ? 'wait' : 'pointer',
                        opacity: busy && busy !== String(a.id) ? 0.5 : 1,
                      }}
                    >
                      <Avatar
                        size={30}
                        style={{ background: tone.bg, color: tone.fg, fontSize: 15, fontWeight: 600, flex: 'none' }}
                      >
                        {initials(a.name)}
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: c.ink }}>{a.name}</div>
                        <div
                          dir="ltr"
                          style={{
                            fontSize: 14.5, color: c.inkGhost, textAlign: 'start',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {a.email}
                        </div>
                      </div>
                      <Tag color={ROLE_COLOR[a.role]} style={{ marginInlineEnd: 0 }}>
                        {ROLE_LABEL[a.role] ?? a.role}
                      </Tag>
                    </button>
                  );
                })}
              </div>
            )}
            {error && <Alert type="error" showIcon title={error} style={{ marginTop: 12 }} />}
          </Card>
        ) : (
          <Card styles={{ body: { padding: 22 } }}>
            <Form
              form={form}
              layout="vertical"
              onFinish={(v) => send(v, 'form')}
              requiredMark={false}
              disabled={busy !== null}
            >
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
              <Button type="primary" htmlType="submit" block loading={busy !== null}>
                چوونەژوورەوە
              </Button>
            </Form>
          </Card>
        )}

        {dev && !localSignin && (
          <Card size="small" title="هەژمارەکانی گەشەپێدان" styles={{ body: { padding: 12 } }}>
            <Text type="secondary" style={{ fontSize: 15 }}>
              وشەی نهێنی: <code dir="ltr">{DEV_PASSWORD}</code>
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
          {localSignin
            ? 'ئەمە چوونەژوورەوەی ڕاستەقینە نییە؛ تەنها بۆ بینینی دەزگاکەیە.'
            : 'هەژمارەکان لەلایەن بەڕێوەبەرەوە دروست دەکرێن. دەستکارییەکان تەنها دوای پەسەندکردن لە ماڵپەڕی گشتیدا دەردەکەون.'}
        </Text>
      </div>
    </div>
  );
}
