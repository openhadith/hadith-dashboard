'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert, Avatar, Button, Card, Checkbox, Descriptions, Form, Input, Modal, Progress, Select, Space,
  Table, Tabs, Tag, Tooltip, Typography,
} from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useStudio } from './StudioContext';
import { useToast } from './useToast';
import {
  agoKu, avatarOf, c, initials, PERMISSION_LABEL, PERMISSIONS, ROLE_LABEL, TEAM_ROLE_LABEL, toAr,
} from '@/lib/tokens';

const { Text, Title } = Typography;

interface User {
  id: number; name: string; email: string; role: string;
  avatar_tone: string; status: string; last_seen: string; workload: number;
}
interface Team {
  id: number; name: string; color: string; scope: string | null;
  lead_name: string | null; total: number; done: number;
}
interface Member { team_id: number; user_id: number; role: string; name: string; avatar_tone: string }
interface BookScope { team_id: number; book_id: string; book_title: string }
interface Cell { role: string; permission: string; allowed: boolean }

const ROLES = ['supervisor', 'muhaqqiq', 'editor', 'reviewer', 'viewer'];
const ROLE_COLOR: Record<string, string> = {
  supervisor: c.emerald, muhaqqiq: c.blue, editor: c.goldFg, reviewer: c.plum, viewer: c.inkFaint,
};

function UserAvatar({ name, tone, size = 24 }: { name: string; tone: string; size?: number }) {
  const t = avatarOf(tone);
  return (
    <Avatar size={size} style={{ background: t.bg, color: t.fg, fontSize: size * 0.4, fontWeight: 600, flex: 'none' }}>
      {initials(name)}
    </Avatar>
  );
}

export default function AdminUsersView({
  users, teams, members, books, matrix,
}: {
  users: User[]; teams: Team[]; members: Member[]; books: BookScope[]; matrix: Cell[];
}) {
  const router = useRouter();
  const { can, refresh } = useStudio();
  const toast = useToast();
  const [selTeam, setSelTeam] = useState(teams[0]?.id ?? 0);
  const [cells, setCells] = useState(matrix);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm] = Form.useForm<{ name: string; email: string; password: string; role: string }>();

  const createAccount = async (v: { name: string; email: string; password: string; role: string }) => {
    setAdding(true);
    const j = await (await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v),
    })).json();
    setAdding(false);
    if (!j.success) {
      toast(j.error ?? 'دروستکردنی هەژمار سەرکەوتوو نەبوو', 'error');
      return;
    }
    toast(`هەژماری «${v.name}» دروستکرا`);
    setAddOpen(false);
    addForm.resetFields();
    router.refresh();
  };

  const readOnly = !can('admin');
  const team = teams.find((t) => t.id === selTeam);

  const allowed = (role: string, permission: string) =>
    cells.find((x) => x.role === role && x.permission === permission)?.allowed ?? false;

  const toggleCell = async (role: string, permission: string) => {
    if (readOnly) return;
    const next = !allowed(role, permission);

    // Optimistic: the grid should feel like a switchboard, not a form.
    setCells((cs) => {
      const i = cs.findIndex((x) => x.role === role && x.permission === permission);
      if (i === -1) return [...cs, { role, permission, allowed: next }];
      const copy = [...cs];
      copy[i] = { ...copy[i], allowed: next };
      return copy;
    });

    const j = await (await fetch('/api/admin/permissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, permission, allowed: next }),
    })).json();

    if (!j.success) {
      setCells(matrix);
      toast(j.error ?? 'گۆڕانکاری سەرکەوتوو نەبوو', 'error');
      return;
    }
    toast(
      `${ROLE_LABEL[role]} · ${PERMISSION_LABEL[permission]} ${next ? 'چالاککرا' : 'ناچالاککرا'}`,
      next ? 'ok' : 'warn',
    );
    // The signed-in user's own role may be the one that changed; re-read it so
    // the chrome's affordances follow immediately.
    await refresh();
    router.refresh();
  };

  const changeRole = async (userId: number, role: string) => {
    const j = await (await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    })).json();
    if (j.success) {
      toast('ڕۆڵ گۆڕدرا');
      await refresh();
      router.refresh();
    } else toast(j.error ?? 'سەرکەوتوو نەبوو', 'error');
  };

  // ------------------------------------------------------------ users table
  const userColumns: ColumnsType<User> = [
    {
      title: 'ناو', key: 'name',
      render: (_, u) => (
        <Space size={8}>
          <UserAvatar name={u.name} tone={u.avatar_tone} size={26} />
          <Text strong style={{ fontSize: 16 }}>{u.name}</Text>
          {u.status === 'off' && <Tag>ناچالاک</Tag>}
        </Space>
      ),
    },
    {
      title: 'ئیمەیل', dataIndex: 'email', key: 'email',
      render: (v: string) => <Text dir="ltr" style={{ fontSize: 15, color: c.inkFaint }}>{v}</Text>,
    },
    {
      title: 'ڕۆڵ', key: 'role', width: 170,
      render: (_, u) => (
        <Select
          size="small"
          value={u.role}
          disabled={readOnly}
          style={{ width: 150 }}
          onChange={(v) => changeRole(u.id, v)}
          options={ROLES.map((r) => ({
            value: r,
            label: <span style={{ color: ROLE_COLOR[r], fontWeight: 600 }}>{ROLE_LABEL[r]}</span>,
          }))}
        />
      ),
    },
    {
      title: 'بارکاری', dataIndex: 'workload', key: 'workload', width: 90,
      sorter: (a, b) => a.workload - b.workload,
      render: (v: number) => <Text strong>{toAr(v)}</Text>,
    },
    {
      title: 'دواین چالاکی', key: 'last', width: 110,
      render: (_, u) => <Text style={{ fontSize: 15, color: c.inkGhost }}>{agoKu(u.last_seen)}</Text>,
    },
  ];

  // ------------------------------------------------------------ role matrix
  type MatrixRow = { role: string };
  const matrixColumns: ColumnsType<MatrixRow> = [
    {
      title: 'ڕۆڵ \\ مۆڵەت', key: 'role', width: 170, fixed: 'start',
      render: (_, r) => (
        <Space size={8}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: ROLE_COLOR[r.role], display: 'inline-block' }} />
          <Text strong style={{ fontSize: 16 }}>{ROLE_LABEL[r.role]}</Text>
        </Space>
      ),
    },
    ...PERMISSIONS.map((p) => ({
      title: PERMISSION_LABEL[p],
      key: p,
      align: 'center' as const,
      render: (_: unknown, r: MatrixRow) => (
        <Tooltip title={readOnly ? 'مۆڵەتی بەڕێوەبردنت نییە' : undefined}>
          <Checkbox
            checked={allowed(r.role, p)}
            disabled={readOnly}
            onChange={() => toggleCell(r.role, p)}
          />
        </Tooltip>
      ),
    })),
  ];

  // ---------------------------------------------------------------- teams
  const teamsTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {teams.map((t) => {
        const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
        const roster = members.filter((m) => m.team_id === t.id);
        const scope = books.filter((b) => b.team_id === t.id);
        const active = t.id === selTeam;
        return (
          <Card
            key={t.id}
            size="small"
            hoverable
            onClick={() => setSelTeam(t.id)}
            style={{
              borderInlineStart: `4px solid ${t.color}`,
              borderColor: active ? t.color : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <Text strong style={{ fontSize: 17.5 }}>{t.name}</Text>
              <Tag color="success">چالاک</Tag>
              <Text type="secondary" style={{ marginInlineStart: 'auto', fontSize: 15 }}>
                سەرپەرشتیار: {t.lead_name ?? '—'}
              </Text>
            </div>
            <Text type="secondary" style={{ fontSize: 15 }}>{t.scope}</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
              <Progress
                percent={pct}
                strokeColor={t.color}
                railColor={c.line}
                size="small"
                style={{ flex: 1, margin: 0 }}
                format={(p) => `${toAr(p ?? 0)}٪`}
              />
              <Text style={{ fontSize: 15, color: c.inkGhost, flex: 'none' }}>
                {toAr(t.done)} لە {toAr(t.total)}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Avatar.Group max={{ count: 5 }}>
                {roster.map((m) => (
                  <Tooltip key={m.user_id} title={`${m.name} · ${TEAM_ROLE_LABEL[m.role] ?? m.role}`}>
                    <span><UserAvatar name={m.name} tone={m.avatar_tone} size={24} /></span>
                  </Tooltip>
                ))}
              </Avatar.Group>
              <Space size={4} wrap style={{ marginInlineStart: 'auto' }}>
                {scope.map((b) => (
                  <Tag key={b.book_id} style={{ fontFamily: 'var(--font-amiri), serif', fontSize: 16 }}>
                    {b.book_title}
                  </Tag>
                ))}
              </Space>
            </div>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 32px 48px' }}>
        <Title level={4} style={{ margin: '0 0 10px' }}>بەکارهێنەر و تیم</Title>

        {readOnly && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title="ڕۆڵەکەت مۆڵەتی «بەڕێوەبردن»ی نییە — تەنها بینین."
          />
        )}

        <Tabs
          items={[
            { key: 'teams', label: `تیمەکان (${toAr(teams.length)})`, children: teamsTab },
            {
              key: 'users',
              label: `بەکارهێنەران (${toAr(users.length)})`,
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Text type="secondary" style={{ fontSize: 15, flex: 1 }}>
                      هەژمارەکان هاوبەشن لەگەڵ API ـی ماڵپەڕی گشتی. خۆتۆمارکردنی گشتی داخراوە.
                    </Text>
                    <Button
                      type="primary"
                      icon={<UserAddOutlined />}
                      disabled={readOnly}
                      onClick={() => setAddOpen(true)}
                    >
                      هەژماری نوێ
                    </Button>
                  </div>
                  <Table<User>
                    rowKey="id"
                    size="small"
                    columns={userColumns}
                    dataSource={users}
                    pagination={false}
                  />
                </div>
              ),
            },
            {
              key: 'roles',
              label: 'ڕۆڵ و مۆڵەت',
              children: (
                <Card
                  size="small"
                  title="ماتریکسی ڕۆڵ و مۆڵەت"
                  extra={
                    <Text type="secondary" style={{ fontSize: 15 }}>
                      هەر خانەیەک یەکسەر کاردەکات — ئەم ماتریکسە ئەوەیە کە سیستەمەکە جێبەجێی دەکات
                    </Text>
                  }
                  styles={{ body: { padding: 0 } }}
                >
                  <Table<MatrixRow>
                    rowKey="role"
                    size="middle"
                    columns={matrixColumns}
                    dataSource={ROLES.map((role) => ({ role }))}
                    pagination={false}
                    scroll={{ x: 640 }}
                  />
                </Card>
              ),
            },
          ]}
        />
      </div>

      <Modal
        open={addOpen}
        title="هەژماری نوێ"
        okText="دروستکردن"
        cancelText="پاشگەزبوونەوە"
        confirmLoading={adding}
        onOk={() => addForm.submit()}
        onCancel={() => setAddOpen(false)}
        destroyOnHidden
      >
        <Form form={addForm} layout="vertical" onFinish={createAccount} requiredMark={false}
          initialValues={{ role: 'editor' }}>
          <Form.Item name="name" label="ناو" rules={[{ required: true, min: 2, message: 'ناو بنووسە' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="ئیمەیل"
            rules={[{ required: true, type: 'email', message: 'ئیمەیلێکی دروست بنووسە' }]}>
            <Input dir="ltr" autoComplete="off" />
          </Form.Item>
          <Form.Item name="password" label="وشەی نهێنیی سەرەتایی"
            extra="لانیکەم ٨ پیت. بە شێوەیەکی پارێزراو بیدە بە خاوەنەکەی."
            rules={[{ required: true, min: 8, message: 'لانیکەم ٨ پیت' }]}>
            <Input.Password dir="ltr" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="ڕۆڵ" rules={[{ required: true }]}>
            <Select
              options={ROLES.map((r) => ({
                value: r,
                label: <span style={{ color: ROLE_COLOR[r], fontWeight: 600 }}>{ROLE_LABEL[r]}</span>,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <aside className="side-rail">
        {team && (
          <>
            <div>
              <Space size={8}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: team.color, display: 'inline-block' }} />
                <Text strong style={{ fontSize: 17.5 }}>{team.name}</Text>
              </Space>
              <div><Text type="secondary" style={{ fontSize: 15 }}>{team.scope}</Text></div>
            </div>

            <Card size="small" title="ئەندامان" styles={{ body: { padding: 0 } }}>
              {members.filter((m) => m.team_id === team.id).map((m) => (
                <div
                  key={m.user_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px',
                    borderBottom: `1px solid ${c.lineSoft}`,
                  }}
                >
                  <UserAvatar name={m.name} tone={m.avatar_tone} />
                  <Text style={{ flex: 1, fontSize: 16 }}>{m.name}</Text>
                  <Tag style={{ marginInlineEnd: 0 }}>{TEAM_ROLE_LABEL[m.role] ?? m.role}</Tag>
                </div>
              ))}
            </Card>

            <Card size="small" title="پەرتووکە دەستنیشانکراوەکان">
              <Space size={6} wrap>
                {books.filter((b) => b.team_id === team.id).map((b) => (
                  <Tag key={b.book_id} style={{ fontFamily: 'var(--font-amiri), serif', fontSize: 16.5 }}>
                    {b.book_title}
                  </Tag>
                ))}
              </Space>
            </Card>

            <Card size="small" title="کورتە">
              <Descriptions
                size="small"
                column={1}
                items={[
                  { key: 'total', label: 'کۆی ڕەکۆرد', children: toAr(team.total) },
                  { key: 'done', label: 'تەواوبوو', children: toAr(team.done) },
                  { key: 'lead', label: 'سەرپەرشتیار', children: team.lead_name ?? '—' },
                ]}
              />
            </Card>
          </>
        )}
      </aside>
    </div>
  );
}
