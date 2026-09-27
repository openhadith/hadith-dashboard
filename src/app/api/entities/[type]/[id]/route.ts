import { deleteEntity, getEntity, restoreEntity, updateEntity } from '@/lib/crud';
import { isEntityType } from '@/lib/entities';
import { readSession, requirePermission } from '@/lib/session';

/** One record, corpus merged with any studio edit. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  if (!isEntityType(type)) {
    return Response.json({ success: false, error: 'جۆری نەناسراو' }, { status: 400 });
  }

  const row = await getEntity(type, decodeURIComponent(id));
  if (!row) {
    return Response.json({ success: false, error: 'ڕەکۆرد نەدۆزرایەوە' }, { status: 404 });
  }
  return Response.json({ success: true, data: row });
}

/** Saves an edit. Body: { data, reason? } */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  if (!isEntityType(type)) {
    return Response.json({ success: false, error: 'جۆری نەناسراو' }, { status: 400 });
  }

  const session = await readSession();
  const denied = requirePermission(session, 'edit');
  if (denied) return denied;

  const { data, reason } = await request.json();
  await updateEntity(type, decodeURIComponent(id), data ?? {}, session.user.id, reason);

  return Response.json({ success: true });
}

/**
 * Removes a record.
 *
 * Gated on `merge` rather than `edit`: deletion is the one CRUD action that
 * removes information from every downstream view, so it sits with the other
 * destructive permission instead of ordinary editing.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  if (!isEntityType(type)) {
    return Response.json({ success: false, error: 'جۆری نەناسراو' }, { status: 400 });
  }

  const session = await readSession();
  const denied = requirePermission(session, 'merge');
  if (denied) return denied;

  const reason = new URL(request.url).searchParams.get('reason');
  await deleteEntity(type, decodeURIComponent(id), session.user.id, reason);

  return Response.json({ success: true });
}

/** Lifts a tombstone. Body: {} */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  if (!isEntityType(type)) {
    return Response.json({ success: false, error: 'جۆری نەناسراو' }, { status: 400 });
  }

  const session = await readSession();
  const denied = requirePermission(session, 'merge');
  if (denied) return denied;

  await restoreEntity(type, decodeURIComponent(id), session.user.id);
  return Response.json({ success: true });
}
