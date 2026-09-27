import { queryOne } from '@/lib/db';
import { API } from '@/lib/backend';
import { readSessionOrNull, signIn, signOut } from '@/lib/session';

// Seeded rows are marked; production (db:init) has none. Checked once per process.
let demo: Promise<boolean> | null = null;
const isDemo = () =>
  (demo ??= queryOne<{ demo: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM studio_review WHERE snapshot->>'gradeSource' = 'demo') AS demo`,
  ).then((r) => !!r?.demo).catch(() => false));

/** Current identity and permissions, or a null user. */
export async function GET() {
  const session = await readSessionOrNull();
  return Response.json({
    success: true,
    data: {
      user: session?.user ?? null,
      permissions: session?.permissions ?? [],
      demo: session ? await isDemo() : false,
      // Which API sign-in and publishing act on — public anyway (NEXT_PUBLIC_API_URL);
      // scripts/e2e.mjs refuses to run unless it is local.
      api: API,
    },
  });
}

/** Sign in against the hadith API. Body: { email, password } */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');

  if (!email || !password) {
    return Response.json({ success: false, error: 'ئیمەیل و وشەی نهێنی بنووسە' }, { status: 400 });
  }

  const result = await signIn(email, password);
  if ('error' in result) {
    return Response.json({ success: false, error: result.error }, { status: result.status });
  }

  const { user, permissions } = result.session;
  return Response.json({ success: true, data: { user, permissions } });
}

/** Sign out. */
export async function DELETE() {
  await signOut();
  return Response.json({ success: true });
}
