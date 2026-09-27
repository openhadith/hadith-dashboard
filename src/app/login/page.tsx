import LoginView from '@/components/LoginView';

export const dynamic = 'force-dynamic';

export default function StudioLoginPage() {
  return <LoginView dev={process.env.NODE_ENV !== 'production'} />;
}
