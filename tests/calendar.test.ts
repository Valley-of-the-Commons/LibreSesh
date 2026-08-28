import { describe, expect, it } from 'vitest';
import type { SessionDto } from '../server/src/shared/types.js';
import { overlappingIds } from '../web/src/components/Calendar.js';

/** Only the fields overlappingIds actually reads. */
const placed = (id: number, roomId: number, startMin: number, endMin: number) => ({
  session: { id, roomId } as SessionDto,
  startMin,
  endMin,
});

describe('overlappingIds', () => {
  it('finds nothing in an empty or single-session day', () => {
    expect(overlappingIds([])).toEqual(new Set());
    expect(overlappingIds([placed(1, 1, 600, 660)])).toEqual(new Set());
  });

  it('flags both sides of a clash', () => {
    const ids = overlappingIds([placed(1, 1, 600, 660), placed(2, 1, 630, 690)]);
    expect(ids).toEqual(new Set([1, 2]));
  });

  it('does not flag back-to-back sessions', () => {
    expect(overlappingIds([placed(1, 1, 600, 660), placed(2, 1, 660, 720)])).toEqual(new Set());
  });

  it('ignores an identical time span in a different room', () => {
    expect(overlappingIds([placed(1, 1, 600, 660), placed(2, 2, 600, 660)])).toEqual(new Set());
  });

  it('flags a session fully contained in another', () => {
    expect(overlappingIds([placed(1, 1, 600, 720), placed(2, 1, 620, 640)])).toEqual(
      new Set([1, 2]),
    );
  });

  it('flags every member of a three-way pile-up', () => {
    const ids = overlappingIds([
      placed(1, 1, 600, 700),
      placed(2, 1, 620, 720),
      placed(3, 1, 640, 660),
    ]);
    expect(ids).toEqual(new Set([1, 2, 3]));
  });

  it('leaves a clean session out of a room that also has a clash', () => {
    const ids = overlappingIds([
      placed(1, 1, 600, 660),
      placed(2, 1, 630, 690),
      placed(3, 1, 800, 860),
    ]);
    expect(ids).toEqual(new Set([1, 2]));
  });
});
