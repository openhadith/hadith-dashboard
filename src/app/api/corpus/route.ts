import { API } from '@/lib/backend';

/**
 * Thin proxy onto the public corpus API.
 *
 * It exists so browse screens can page and search from the client without
 * hard-coding the upstream base URL into the bundle, and so a search query is
 * routed to `/search` (trigram-indexed) while a plain listing goes to the
 * cheaper list endpoints.
 */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const kind = p.get('kind') ?? 'hadiths';
  const page = Math.max(1, Number(p.get('page') ?? 1));
  const limit = Math.min(50, Number(p.get('limit') ?? 25));
  const q = p.get('q')?.trim();

  // `all` answers the command palette: one upstream search already returns
  // hadiths, narrators and books together, so asking three times would be waste.
  if (kind === 'all') {
    if (!q || q.length < 2) {
      return Response.json({ success: true, data: { hadiths: [], narrators: [], books: [] } });
    }
    try {
      const cap = Math.min(limit, 8);
      const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}&limit=${cap}`, {
        next: { revalidate: 30 },
      });
      const body = await res.json();
      // Trimmed here as well: the upstream search does not honour `limit`.
      return Response.json({
        success: true,
        data: {
          hadiths: (body?.data?.hadiths ?? []).slice(0, cap),
          narrators: (body?.data?.narrators ?? []).slice(0, cap),
          books: (body?.data?.books ?? []).slice(0, cap),
        },
      });
    } catch (err) {
      return Response.json({ success: false, error: (err as Error).message }, { status: 502 });
    }
  }

  if (!['hadiths', 'narrators', 'books'].includes(kind)) {
    return Response.json({ success: false, error: 'unknown kind' }, { status: 400 });
  }

  try {
    // A query goes through the normalised search index; browsing does not.
    if (q) {
      const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}&limit=${limit}&page=${page}`, {
        next: { revalidate: 30 },
      });
      const body = await res.json();
      const rows = body?.data?.[kind] ?? [];
      return Response.json({
        success: true,
        // `/search` reports `hasMore` rather than a count, so the pager is told
        // there is one more page whenever there is.
        data: { rows, total: (page - 1) * limit + rows.length + (body?.data?.pagination?.hasMore ? 1 : 0) },
      });
    }

    const res = await fetch(`${API}/${kind}?page=${page}&limit=${limit}`, {
      next: { revalidate: 60 },
    });
    const body = await res.json();
    return Response.json({
      success: true,
      data: {
        rows: body?.data?.[kind] ?? [],
        total: body?.data?.pagination?.totalCount ?? 0,
      },
    });
  } catch (err) {
    return Response.json(
      { success: false, error: `نەتوانرا پەیوەندی بە API بکرێت: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
