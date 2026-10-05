/**
 * Deployment mode.
 *
 * Both are read at runtime and carry no NEXT_PUBLIC_ prefix, so changing either
 * on a host takes effect on the next request instead of needing a rebuild — and
 * neither reaches the browser bundle, where it could be edited.
 */

/**
 * Sign in by picking an account, with no password and no API token.
 *
 * For a shared deployment pointed at a corpus whose accounts nobody holds
 * credentials for. It is not authentication, which is why it forces READ_ONLY
 * below.
 */
export const LOCAL_SIGNIN = process.env.DASHBOARD_LOCAL_SIGNIN === 'true';

/**
 * Refuse every write: no drafts, no approvals, no publishing, no account or
 * permission changes. Reading is unaffected.
 *
 * Local sign-in forces it on. Without a password there is nothing establishing
 * who the person is, so whoever opens the link must not be able to change
 * anything — least of all publish to the corpus.
 */
export const READ_ONLY = process.env.DASHBOARD_READ_ONLY === 'true' || LOCAL_SIGNIN;

/** What a session is allowed to do when the deployment refuses writes. */
export const VIEW_ONLY_PERMISSIONS = ['view'] as const;
