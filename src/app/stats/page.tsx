import { loadStats, type StatsData } from '@/lib/stats';
import StatsView from '@/components/StatsView';
import SetupNotice from '@/components/SetupNotice';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  let data: StatsData | null = null;
  let error: string | undefined;
  try {
    data = await loadStats();
  } catch (err) {
    error = (err as Error).message;
  }
  if (!data) return <SetupNotice error={error} />;
  return <StatsView data={data} />;
}
