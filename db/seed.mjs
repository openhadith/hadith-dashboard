/**
 * Seeds the studio demo database.
 *
 *   node studio/seed.mjs
 *
 * Content (matn, book titles, narrator names) is pulled live from
 * api.openhadith.org so the demo shows the real corpus. Everything else —
 * statuses, assignees, issues, audit trail — is generated here, because none of
 * it exists in production yet; that is precisely the gap the studio fills.
 *
 * Generated values use a fixed-seed PRNG, so re-running produces the same
 * database and screenshots stay stable between demos.
 *
 * IMPORTANT: grades assigned below are demo workflow metadata, NOT scholarly
 * rulings from the corpus. Rows carry snapshot.gradeSource = 'demo' and the UI
 * labels them, so nothing here can be mistaken for a real hukm.
 */

import pg from 'pg';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4005/api';
const DB = process.env.STUDIO_DATABASE_URL
  || 'postgresql://localhost:5432/hadith_studio';

// ---------------------------------------------------------------- utilities

/** Mulberry32 — small, fast, and stable across Node versions. */
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260920);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
/** Picks by weight: weighted([['a',3],['b',1]]) yields 'a' three times as often. */
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of pairs) {
    if ((r -= w) <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
};
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  const body = await res.json();
  return body.data;
}

// ------------------------------------------------------------- demo fixtures

// The cast from the design comps, kept verbatim so screens match the mockups.
// These are profiles only: each is linked to the API account with the same
// email on first sign-in (the API's `npm run dev:db` creates those accounts).
const USERS = [
  ['م. زانا', 'zana@muhaqqiq.org', 'supervisor', 'a', 'on'],
  ['د. أحمد الراوی', 'ahmad@muhaqqiq.org', 'muhaqqiq', 'g', 'on'],
  ['ز. محمد', 'mohammed@muhaqqiq.org', 'muhaqqiq', 'b', 'on'],
  ['ن. سۆران', 'soran@muhaqqiq.org', 'editor', 'g', 'on'],
  ['د. سارا', 'sara@muhaqqiq.org', 'reviewer', 'p', 'on'],
  ['ك. هێمن', 'hemn@muhaqqiq.org', 'editor', 'b', 'on'],
  ['د. کاروان', 'karwan@muhaqqiq.org', 'muhaqqiq', 'g', 'on'],
  ['ه. ڕێبین', 'rebin@muhaqqiq.org', 'viewer', 'r', 'off'],
];

// Real book ids, resolved against the live corpus.
const BOOKS = {
  bukhari: '146',
  muslim: '158',
  tirmidhi: '195',
  abuDawud: '184',
  ibnMajah: '173',
  darimi: '137',
  ahmad: '121',
  ibnHibban: '454',
  muwatta: '22',
};

const TEAMS = [
  {
    name: 'تیمی صحیحین',
    color: '#2f6f5b',
    scope: 'پەسەندکردنی حەدیسی صحیح البخاری و مسلم',
    lead: 'ahmad@muhaqqiq.org',
    books: [BOOKS.bukhari, BOOKS.muslim],
    members: [
      ['ahmad@muhaqqiq.org', 'lead'],
      ['zana@muhaqqiq.org', 'verifier'],
      ['mohammed@muhaqqiq.org', 'editor'],
      ['sara@muhaqqiq.org', 'reviewer'],
      ['rebin@muhaqqiq.org', 'viewer'],
    ],
  },
  {
    name: 'تیمی سنن',
    color: '#c79a3a',
    scope: 'سنن الترمذی و أبی داود و ابن ماجه',
    lead: 'zana@muhaqqiq.org',
    books: [BOOKS.tirmidhi, BOOKS.abuDawud, BOOKS.ibnMajah],
    members: [
      ['zana@muhaqqiq.org', 'lead'],
      ['soran@muhaqqiq.org', 'verifier'],
      ['hemn@muhaqqiq.org', 'editor'],
      ['sara@muhaqqiq.org', 'reviewer'],
    ],
  },
  {
    name: 'تیمی ڕاویان و سەنەد',
    color: '#3f6392',
    scope: 'پشکنینی زنجیرەی ڕاویان لە هەموو سەرچاوەکان',
    lead: 'mohammed@muhaqqiq.org',
    books: [BOOKS.ahmad, BOOKS.ibnHibban, BOOKS.darimi, BOOKS.muwatta],
    members: [
      ['mohammed@muhaqqiq.org', 'lead'],
      ['soran@muhaqqiq.org', 'verifier'],
      ['karwan@muhaqqiq.org', 'editor'],
    ],
  },
];

// Roughly the chip counts shown in Validation Queue.dc.html:322.
const STATUS_MIX = [
  ['pending', 184],
  ['discuss', 38],
  ['research', 26],
  ['duplicate', 15],
  ['conflict', 7],
  ['approved', 40],
  ['published', 24],
];

const ISSUE_MIX = [
  [[], 58],
  [['sanad'], 12],
  [['ref'], 10],
  [['dup'], 6],
  [['unknown'], 6],
  [['conflict'], 3],
  [['sanad', 'ref'], 3],
  [['sanad', 'unknown'], 2],
];

// ------------------------------------------------------------------- seeding

async function main() {
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  console.log(`→ ${DB}`);

  await client.query('BEGIN');
  await client.query(`TRUNCATE studio_activity, studio_saved_views, studio_audit,
    studio_revisions, studio_issues, studio_review,
    studio_team_books, studio_team_members, studio_teams, studio_users
    RESTART IDENTITY CASCADE`);

  // --- users
  const userId = new Map();
  for (const [name, email, role, tone, status] of USERS) {
    const { rows } = await client.query(
      `INSERT INTO studio_users (name, email, role, avatar_tone, status, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [name, email, role, tone, status, minutesAgo(Math.floor(rand() * 4000))],
    );
    userId.set(email, rows[0].id);
  }
  console.log(`  users        ${userId.size}`);

  // --- book titles, resolved from the live corpus
  const allBooks = await getJson('/books?limit=2000');
  const bookTitle = new Map(allBooks.books.map((b) => [String(b.id), b.title]));

  // --- teams
  const teamId = new Map();
  for (const t of TEAMS) {
    const { rows } = await client.query(
      `INSERT INTO studio_teams (name, color, scope, lead_id)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [t.name, t.color, t.scope, userId.get(t.lead)],
    );
    const id = rows[0].id;
    teamId.set(t.name, id);
    for (const [email, role] of t.members) {
      await client.query(
        `INSERT INTO studio_team_members (team_id, user_id, role) VALUES ($1,$2,$3)`,
        [id, userId.get(email), role],
      );
    }
    for (const bid of t.books) {
      await client.query(
        `INSERT INTO studio_team_books (team_id, book_id, book_title) VALUES ($1,$2,$3)`,
        [id, bid, bookTitle.get(bid) || `کتاب ${bid}`],
      );
    }
  }
  console.log(`  teams        ${teamId.size}`);

  // --- review queue, built from real hadiths
  // Each team's books contribute rows, so per-book workload on the Assignments
  // screen reflects the same data the queue shows.
  const perBook = 42;
  let reviewCount = 0;
  let issueCount = 0;
  const seeded = [];

  for (const team of TEAMS) {
    const tid = teamId.get(team.name);
    const memberIds = team.members.map(([email]) => userId.get(email));

    for (const bid of team.books) {
      const page = 1 + Math.floor(rand() * 3);
      let data;
      try {
        data = await getJson(`/hadiths?bookId=${bid}&limit=${perBook}&page=${page}`);
      } catch (err) {
        console.warn(`  ! book ${bid} skipped: ${err.message}`);
        continue;
      }

      for (const h of data.hadiths || []) {
        const status = weighted(STATUS_MIX);
        const issues = weighted(ISSUE_MIX);
        // Demo metadata — see the file header. Never a claim about the corpus.
        const grade = weighted([
          ['sahih', 55], ['hasan', 25], ['daif', 15], ['unknown', 5],
        ]);
        const assignee = pick(memberIds);
        const updated = minutesAgo(Math.floor(rand() * 20160)); // up to 2 weeks

        const snapshot = {
          matn: (h.matn || h.clean_matn || '').slice(0, 400),
          type: h.type || null,
          bookId: bid,
          bookTitle: bookTitle.get(bid) || null,
          gradeSource: 'demo',
        };

        const { rows } = await client.query(
          `INSERT INTO studio_review
             (entity_type, entity_id, status, grade, assignee_id, team_id, priority, snapshot, updated_at)
           VALUES ('hadith',$1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (entity_type, entity_id) DO NOTHING
           RETURNING id`,
          [String(h.id), status, grade, assignee, tid,
           Math.floor(rand() * 3), JSON.stringify(snapshot), updated],
        );
        if (!rows.length) continue; // duplicate hadith across books
        reviewCount++;
        seeded.push({ id: rows[0].id, entityId: String(h.id), status, assignee, snapshot });

        for (const type of issues) {
          await client.query(
            `INSERT INTO studio_issues (review_id, type, severity, detector)
             VALUES ($1,$2,$3,$4)`,
            [rows[0].id, type,
             type === 'conflict' || type === 'sanad' ? 'error' : 'warn',
             weighted([['auto', 3], ['human', 1]])],
          );
          issueCount++;
        }
      }
      process.stdout.write(`  reviews      ${reviewCount}\r`);
    }
  }
  console.log(`  reviews      ${reviewCount}   `);
  console.log(`  issues       ${issueCount}`);

  // --- audit trail, derived from the rows above so the log is consistent
  const ACTIONS = [
    ['approve', 'پەسەندکردنی حەدیس'],
    ['reject', 'ڕەتکردنەوەی حەدیس'],
    ['edit', 'دەستکاری دەق'],
    ['assign', 'دابەشکردن'],
    ['merge', 'یەکخستنی دووبارە'],
    ['role_change', 'گۆڕینی ڕۆڵ'],
    ['login', 'چوونەژوورەوە'],
    ['publish', 'بڵاوکردنەوە'],
  ];
  let auditCount = 0;
  for (let i = 0; i < 140; i++) {
    const [action] = pick(ACTIONS);
    const target = pick(seeded);
    const actor = pick([...userId.values()]);
    const changes = action === 'edit'
      ? { before: { matn: target.snapshot.matn?.slice(0, 60) },
          after: { matn: (target.snapshot.matn || '').slice(0, 58) + '…' } }
      : action === 'role_change'
        ? { before: { role: 'editor' }, after: { role: 'muhaqqiq' } }
        : action === 'assign'
          ? { before: { assignee: null }, after: { assignee: target.assignee } }
          : { before: null, after: { status: target.status } };

    await client.query(
      `INSERT INTO studio_audit
         (actor_id, action, entity_type, entity_id, before, after, reason, created_at)
       VALUES ($1,$2,'hadith',$3,$4,$5,$6,$7)`,
      [actor, action, target.entityId,
       changes.before ? JSON.stringify(changes.before) : null,
       JSON.stringify(changes.after),
       action === 'merge' || action === 'reject' ? 'دووبارەی دڵنیاکراو' : null,
       minutesAgo(Math.floor(rand() * 20160))],
    );
    auditCount++;
  }
  console.log(`  audit        ${auditCount}`);

  // --- saved views + recent activity for "م. زانا" (the demo's logged-in user)
  const zana = userId.get('zana@muhaqqiq.org');
  const VIEWS = [
    ['بەستراو بە من', '★', { assignee: 'me' }],
    ['شکاوی سەنەد', '◧', { issue: 'sanad' }],
    ['ناکۆکییەکان', '⚑', { status: 'conflict' }],
    ['کۆن‌ترین', '◷', { sort: 'oldest' }],
  ];
  for (const [label, icon, query] of VIEWS) {
    await client.query(
      `INSERT INTO studio_saved_views (user_id, label, icon, query) VALUES ($1,$2,$3,$4)`,
      [zana, label, icon, JSON.stringify(query)],
    );
  }

  const mine = seeded.filter((s) => s.assignee === zana).slice(0, 14);
  for (let i = 0; i < mine.length; i++) {
    await client.query(
      `INSERT INTO studio_activity (user_id, entity_type, entity_id, label, detail, pinned, at)
       VALUES ($1,'hadith',$2,$3,$4,$5,$6)`,
      [zana, mine[i].entityId,
       (mine[i].snapshot.matn || '').slice(0, 70),
       mine[i].snapshot.bookTitle, i < 4, minutesAgo(i * 37 + 5)],
    );
  }
  console.log(`  saved views  ${VIEWS.length}`);
  console.log(`  activity     ${mine.length}`);

  await client.query('COMMIT');
  await client.end();
  console.log('\n✓ seed complete');
}

main().catch(async (err) => {
  console.error('\n✗ seed failed:', err.message);
  process.exit(1);
});
