import { describe, expect, it } from 'vitest';
import { sameValue } from './crud';
import { orderChain, type ChainLink } from './corpus';
import { chainKey } from './isnad';
import { ENTITIES, publishableFields } from './entities';

describe('sameValue', () => {
  it('treats empty and missing as equal, and compares numbers loosely', () => {
    expect(sameValue('', null)).toBe(true);
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue(2, '2')).toBe(true);
    expect(sameValue('a', 'b')).toBe(false);
    expect(sameValue(0, null)).toBe(false);
    expect(sameValue(false, null)).toBe(false);
  });
});

describe('orderChain', () => {
  const link = (rawyId: string, toldById: string | null): ChainLink =>
    ({ id: rawyId, rawyId, toldById, sanadId: '1', rawy: { Name: rawyId } });

  it('walks told_by from the collector, whatever order the API returns', () => {
    const chain = orderChain([link('c', null), link('a', 'b'), link('b', 'c')]);
    expect(chainKey(chain)).toBe('a,b,c');
  });

  it('appends links from other branches instead of dropping them', () => {
    const chain = orderChain([link('a', 'b'), link('b', null), link('x', 'b')]);
    expect(chain).toHaveLength(3);
  });
});

describe('publishableFields', () => {
  it('publishes corpus columns only', () => {
    expect(publishableFields('hadith')).toEqual(['matn', 'full_hadith', 'type']);
    expect(publishableFields('narrator')).toContain('rutba');
    expect(publishableFields('book')).not.toContain('authorName');
  });

  it('keeps dashboard-only types entirely local', () => {
    for (const type of ['author', 'chapter', 'word', 'topic'] as const) {
      expect(ENTITIES[type].corpusList).toBeUndefined();
      expect(publishableFields(type)).toEqual([]);
    }
  });
});
