import { loadDashboard, type DashboardData } from '@/lib/dashboard';
import DashboardView from '@/components/DashboardView';
import SetupNotice from '@/components/SetupNotice';

export const dynamic = 'force-dynamic';

export default async function StudioDashboard() {
  let data: DashboardData | null = null;
  let error: string | undefined;

  try {
    data = await loadDashboard();
  } catch (err) {
    error = (err as Error).message;
  }

  if (!data) return <SetupNotice error={error} />;
  return <DashboardView data={data} />;
}
