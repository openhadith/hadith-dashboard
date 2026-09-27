import { createEntity, listEntities, changeSummary } from '@/lib/crud';
import { isEntityType } from '@/lib/entities';
import { readSession, requirePermission } from '@/lib/session';

/** Lists one entity type: corpus merged with studio edits. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  if (!isEntityType(type)) {
    return Response.json({ success: false, error: 'جۆری نەناسراو' }, { status: 400 });
  }

  const p = new URL(request.url).searchParams;
  const [result, summary] = await Promise.all([
    listEntities(type, {
      page: Number(p.get('page') ?? 1),
      limit: Number(p.get('limit') ?? 25),
      q: p.get('q') ?? undefined,
      deletedOnly: p.get('deleted') === '1',
    }),
    changeSummary(type),
  ]);

  return Response.json({ success: true, data: { ...result, summary } });
}

/** Creates a studio-local record. Body: { data } */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  if (!isEntityType(type)) {
    return Response.json({ success: false, error: 'جۆری نەناسراو' }, { status: 400 });
  }

  const session = await readSession();
  const denied = requirePermission(session, 'edit');
  if (denied) return denied;

  const { data } = await request.json();
  const id = await createEntity(type, data ?? {}, session.user.id);

  return Response.json({ success: true, data: { id } }, { status: 201 });
}
