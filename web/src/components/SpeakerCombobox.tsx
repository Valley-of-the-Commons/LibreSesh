import { useEffect, useMemo, useRef, useState } from 'react';
import type { PersonDto } from '@shared/types';
import { inputClass } from './ui';

/** What the form will submit: an existing person, someone new, or nobody. */
export interface SpeakerChoice {
  speakerId: number | null;
  /** Non-empty only after the explicit “add as someone new” action. */
  newName: string;
}

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Search-first speaker picker (identity spec, B1). Typing filters the roster
 * case- and whitespace-insensitively; creating a person is a deliberate row
 * you pick, never the silent result of free text — that silent default is
 * exactly what bred the "A. Lovelace" / "Ada Lovelace" twins.
 */
export function SpeakerCombobox({
  people,
  value,
  onChange,
}: {
  people: PersonDto[];
  value: SpeakerChoice;
  onChange: (v: SpeakerChoice) => void;
}) {
  const committed = value.newName || (people.find((p) => p.id === value.speakerId)?.name ?? '');
  // null = not editing; the input shows the committed choice.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  const open = query !== null;
  const matches = useMemo(() => {
    const q = normalize(query ?? '');
    return q === '' ? people : people.filter((p) => normalize(p.name).includes(q));
  }, [people, query]);

  // Offer creation only for a name nobody already has (after normalising).
  const q = normalize(query ?? '');
  const creatable =
    q !== '' && !people.some((p) => normalize(p.name) === q)
      ? (query ?? '').trim().replace(/\s+/g, ' ')
      : null;
  const rowCount = matches.length + (creatable ? 1 : 0);

  useEffect(() => setActive(0), [query]);

  // A press outside abandons the edit and shows the committed choice again.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setQuery(null);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const pick = (index: number) => {
    if (index < matches.length) {
      const person = matches[index];
      if (person) onChange({ speakerId: person.id, newName: '' });
    } else if (creatable) {
      onChange({ speakerId: null, newName: creatable });
    }
    setQuery(null);
  };

  return (
    <div className="relative" ref={wrap}>
      <div className="relative">
        <input
          value={query ?? committed}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setQuery(query ?? '')}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (rowCount > 0)
                setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + rowCount) % rowCount);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (rowCount > 0) pick(active);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setQuery(null);
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          maxLength={120}
          placeholder="Search people or type a new name"
          className={inputClass}
        />
        {!open && committed && (
          <button
            type="button"
            aria-label="Clear speaker"
            onClick={() => onChange({ speakerId: null, newName: '' })}
            className="absolute inset-y-0 right-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
          >
            ×
          </button>
        )}
      </div>
      {value.newName && !open && (
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Will be added as someone new.
        </p>
      )}

      {open && rowCount > 0 && (
        <ul
          role="listbox"
          className="absolute z-40 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900"
        >
          {matches.map((person, i) => (
            <li key={person.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                className={`block w-full px-3 py-2 text-left text-xs font-medium text-stone-700 dark:text-stone-200 ${
                  i === active ? 'bg-stone-100 dark:bg-stone-800' : ''
                }`}
              >
                {person.name}
              </button>
            </li>
          ))}
          {creatable && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={active === matches.length}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(matches.length)}
                className={`block w-full px-3 py-2 text-left text-xs font-medium text-blue-700 dark:text-blue-400 ${
                  active === matches.length ? 'bg-stone-100 dark:bg-stone-800' : ''
                }`}
              >
                + Add “{creatable}” as someone new
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
