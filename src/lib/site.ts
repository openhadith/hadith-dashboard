/**
 * The public reading site.
 *
 * The dashboard links out to it ("view on the public site"), so the base URL
 * has to be explicit: these two are separate applications on separate origins,
 * and a bare `/hadith/123` would resolve against the dashboard itself.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://openhadith.org';

export const publicHadithUrl = (id: string) => `${SITE_URL}/hadith/${id}`;
export const publicNarratorUrl = (id: string) => `${SITE_URL}/narrator/${id}`;
