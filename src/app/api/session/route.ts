import { queryOne } from '@/lib/db';
import { API } from '@/lib/backend';
import { LOCAL_SIGNIN, READ_ONLY } from '@/lib/config';
import { readSessionOrNull, signIn, signInLocal, signOut } from '@/lib/session';

/** The one corpus that is actually published to openhadith.org. */
const LIVE_CORPUS = /(^|\/\/)api\.openhadith\.org/;

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
      // Which corpus sign-in and publishing act on. Public anyway
      // (NEXT_PUBLIC_API_URL); the chrome shows it so nobody has to guess
      // whether approving reaches the public site, and scripts/e2e.mjs
      // refuses to run unless it is local.
      corpusSource: { url: API, live: LIVE_CORPUS.test(API) },
      readOnly: READ_ONLY,
      localSignin: LOCAL_SIGNIN,
    },
  });
}

/**
 * Sign in. Body: { email, password }, or { userId } under LOCAL_SIGNIN.
 *
 * The two are mutually exclusive — each refuses when the other's mode is
 * active — so a deployment cannot be signed in to by a route it did not mean
 * to offer.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const result = LOCAL_SIGNIN
    ? await signInLocal(body.userId)
    : await (async () => {
        const email = String(body.email ?? '').trim();
        const password = String(body.password ?? '');
        if (!email || !password) {
          return { error: 'ئیمەیل و وشەی نهێنی بنووسە', status: 400 } as const;
        }
        return signIn(email, password);
      })();

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
