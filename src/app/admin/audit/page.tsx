import { requirePermissionPage } from '@/lib/session';
import AuditView from '@/components/AuditView';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await requirePermissionPage('admin');
  return <AuditView />;
}
