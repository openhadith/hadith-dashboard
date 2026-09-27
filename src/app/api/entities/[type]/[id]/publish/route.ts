import { isEntityType } from '@/lib/entities';
import { publishHadith, publishRecord } from '@/lib/publish';
import { readSession, requirePermission } from '@/lib/session';

/**
 * Publishes one record's draft to the corpus. Body: { reason? }
 *
 * Gated on `approve`, the same permission the API enforces for the write.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id: rawId } = await params;
  if (!isEntityType(type)) {
    return Response.json({ success: false, error: 'جۆری نەناسراو' }, { status: 400 });
  }

  const session = await readSession();
  const denied = requirePermission(session, 'approve');
  if (denied) return denied;

  const { reason } = await request.json().catch(() => ({}));
  const id = decodeURIComponent(rawId);
  const result = type === 'hadith'
    ? await publishHadith(session, id, reason ?? null)
    : await publishRecord(session, type, id, reason ?? null);

  if (!result.ok) {
    return Response.json(
      { success: false, error: result.error, code: result.code },
      { status: result.status && result.status < 500 ? result.status : 502 },
    );
  }
  return Response.json({ success: true, data: { published: result.changed } });
}
