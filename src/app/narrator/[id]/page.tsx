import NarratorProfileView from '@/components/NarratorProfileView';
import { getNarrator } from '@/lib/corpus';

export const dynamic = 'force-dynamic';

export default async function NarratorProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = (await getNarrator(id)) as Record<string, unknown> | null;
  const narrator = (data?.narrator ?? data) as Record<string, unknown> | null;
  return <NarratorProfileView id={id} narrator={narrator} />;
}
