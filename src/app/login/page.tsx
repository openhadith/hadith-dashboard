import LoginView from '@/components/LoginView';
import { API, backend } from '@/lib/backend';
import { LOCAL_SIGNIN, READ_ONLY } from '@/lib/config';
import { listLocalAccounts } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Local dev lists the seeded test accounts automatically. Any other
// environment — including a Vercel deployment pointed at a copy of the corpus
// — only lists them when this is explicitly set, since NODE_ENV is
// "production" on every Vercel deployment whether or not it is the real site.
const SHOW_DEMO_ACCOUNTS =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === 'true';

export default async function StudioLoginPage() {
  // Sign-in cannot work without a reachable API, and that failure is
  // otherwise invisible until someone submits the form — checked here so the
  // page can say so up front instead of leaving it to be guessed at. Under
  // local sign-in the API is only read from, so a failure is a warning about
  // corpus text, not about getting in.
  const probe = await backend('/stats');
  const accounts = await listLocalAccounts();

  return (
    <LoginView
      localSignin={LOCAL_SIGNIN}
      readOnly={READ_ONLY}
      accounts={accounts}
      dev={SHOW_DEMO_ACCOUNTS}
      apiWarning={probe.ok ? null : `${API} — ${probe.error ?? 'unreachable'}`}
    />
  );
}
