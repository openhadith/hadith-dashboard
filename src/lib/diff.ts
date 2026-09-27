/**
 * Word-level Arabic diff.
 *
 * Comparison runs on a *normalised* copy of each word — diacritics stripped,
 * alef/ya/ta-marbuta variants folded — so two spellings of the same word are
 * not reported as a difference, while the original spelling is what gets
 * displayed. This mirrors the normalisation the search index uses
 * (backend `src/lib/arabic.ts`); if the two ever diverge, a hadith could be
 * findable by a word the diff calls different.
 */

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

export function normaliseArabic(word: string): string {
  return word
    .replace(DIACRITICS, '')
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ -> ا
    .replace(/ى/g, 'ي')                      // ى -> ي
    .replace(/ة/g, 'ه')                      // ة -> ه
    .replace(/[^؀-ۿ\s]/g, '')
    .trim();
}

export type DiffOp = { type: 'same' | 'add' | 'remove'; text: string };

/**
 * Longest-common-subsequence word diff.
 *
 * O(n·m) is fine here: matn lengths are tens of words, not thousands, and an
 * exact LCS keeps the alignment stable — a heuristic diff would make the same
 * pair of hadiths look different from one visit to the next.
 */
export function diffWords(left: string, right: string): { a: DiffOp[]; b: DiffOp[]; similarity: number } {
  const A = left.trim().split(/\s+/).filter(Boolean);
  const B = right.trim().split(/\s+/).filter(Boolean);
  const nA = A.map(normaliseArabic);
  const nB = B.map(normaliseArabic);

  const table: number[][] = Array.from({ length: A.length + 1 }, () =>
    new Array(B.length + 1).fill(0),
  );
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      table[i][j] = nA[i] === nB[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const a: DiffOp[] = [];
  const b: DiffOp[] = [];
  let i = 0;
  let j = 0;
  let common = 0;

  while (i < A.length && j < B.length) {
    if (nA[i] === nB[j]) {
      a.push({ type: 'same', text: A[i] });
      b.push({ type: 'same', text: B[j] });
      common++;
      i++; j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      a.push({ type: 'remove', text: A[i++] });
    } else {
      b.push({ type: 'add', text: B[j++] });
    }
  }
  while (i < A.length) a.push({ type: 'remove', text: A[i++] });
  while (j < B.length) b.push({ type: 'add', text: B[j++] });

  const longest = Math.max(A.length, B.length);
  return { a, b, similarity: longest ? Math.round((common / longest) * 100) : 0 };
}
