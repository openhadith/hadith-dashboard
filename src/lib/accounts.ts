import { backend } from './backend';
import { syncProfile, type BackendUser, type StudioSession } from './session';

/**
 * Accounts and the role x permission matrix, both owned by the API.
 *
 * The dashboard keeps a profile per account (for teams and workload); these
 * helpers read the API as the source of truth and keep those profiles in step.
 */

export interface PermissionCell { role: string; permission: string; allowed: boolean }

/** Pulls every account from the API into dashboard profiles. Admins only. */
export async function refreshAccounts(session: StudioSession): Promise<void> {
  if (!session.permissions.includes('admin')) return;
  const r = await backend<Array<BackendUser & { id: string | number }>>('/admin/users', { token: session.token });
  if (!r.ok || !r.data) return;
  for (const u of r.data) {
    await syncProfile({ ...u, id: String(u.id) }, { touch: false });
  }
}

export async function permissionMatrix(session: StudioSession): Promise<PermissionCell[]> {
  if (!session.permissions.includes('admin')) return [];
  const r = await backend<PermissionCell[]>('/admin/permissions', { token: session.token });
  return r.ok && r.data ? r.data : [];
}

/** Kurdish text for the API's refusal codes on account changes. */
export function accountError(code: string | null, fallback: string | null): string {
  if (code === 'last_admin') return 'ناتوانرێت: هیچ کەسێک مۆڵەتی بەڕێوەبردنی نامێنێت';
  if (code === 'unreachable') return 'پەیوەندی بە API نەکرا';
  return fallback ?? 'سەرکەوتوو نەبوو';
}
