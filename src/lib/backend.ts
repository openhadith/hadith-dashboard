/**
 * Authenticated calls to the hadith API.
 *
 * The API owns the corpus and every account: the dashboard signs in there,
 * and publishing an approved edit is a PATCH there. Server-side only — the
 * token never reaches the browser.
 */

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4005/api';

/**
 * A misconfigured API is usually a fast failure (nothing listening on
 * localhost refuses instantly), but a real host that is merely unreachable —
 * wrong hostname, firewalled port — can hang far longer, since the OS retries
 * the TCP handshake before giving up. This bounds every call so a bad
 * NEXT_PUBLIC_API_URL fails with a clear "unreachable" instead of a spinner
 * that never resolves.
 */
const REQUEST_TIMEOUT_MS = 8_000;

export interface BackendResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  /** Machine-readable reason from the API, e.g. 'branched_isnad', 'stale_revision'. */
  code: string | null;
}

export async function backend<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<BackendResult<T>> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? (json?.data ?? null) : null,
      error: res.ok ? null : (json?.error?.message ?? `HTTP ${res.status}`),
      code: res.ok ? null : (json?.error?.code ?? null),
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return {
      ok: false,
      status: 502,
      data: null,
      error: timedOut ? `No response from the API within ${REQUEST_TIMEOUT_MS / 1000}s` : (err as Error).message,
      code: 'unreachable',
    };
  }
}
