import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export type ViewMode = 'cal' | 'list';

export interface Filters {
  day: string | null;
  view: ViewMode | null;
  rooms: number[];
  tags: number[];
  q: string;
  /** "happening now or next" quick filter. */
  soon: boolean;
  /** Show only sessions the current identity has starred. */
  mine: boolean;
}

export interface FilterApi extends Filters {
  active: boolean;
  set: (patch: Partial<Filters>) => void;
  toggleRoom: (id: number) => void;
  toggleTag: (id: number) => void;
  clear: () => void;
}

const parseIds = (raw: string | null): number[] =>
  raw
    ? raw
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];

const toggle = (list: number[], id: number): number[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

/** Filter state lives in the query string so a filtered view is shareable
 *  (SPEC §7.3). */
export function useFilters(): FilterApi {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<Filters>(() => {
    const view = params.get('view');
    return {
      day: params.get('day'),
      view: view === 'cal' || view === 'list' ? view : null,
      rooms: parseIds(params.get('room')),
      tags: parseIds(params.get('tag')),
      q: params.get('q') ?? '',
      soon: params.get('soon') === '1',
      mine: params.get('mine') === '1',
    };
  }, [params]);

  const set = useCallback(
    (patch: Partial<Filters>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const write = (key: string, value: string | null) => {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          };
          if ('day' in patch) write('day', patch.day ?? null);
          if ('view' in patch) write('view', patch.view ?? null);
          if ('rooms' in patch) write('room', (patch.rooms ?? []).join(','));
          if ('tags' in patch) write('tag', (patch.tags ?? []).join(','));
          if ('q' in patch) write('q', patch.q ?? null);
          if ('soon' in patch) write('soon', patch.soon ? '1' : null);
          if ('mine' in patch) write('mine', patch.mine ? '1' : null);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return useMemo(
    () => ({
      ...filters,
      active:
        filters.rooms.length > 0 ||
        filters.tags.length > 0 ||
        filters.q !== '' ||
        filters.soon ||
        filters.mine,
      set,
      toggleRoom: (id: number) => set({ rooms: toggle(filters.rooms, id) }),
      toggleTag: (id: number) => set({ tags: toggle(filters.tags, id) }),
      clear: () => set({ rooms: [], tags: [], q: '', soon: false, mine: false }),
    }),
    [filters, set],
  );
}
