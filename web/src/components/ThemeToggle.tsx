import { useTheme, type Theme } from '../lib/useTheme';

// Segmented control matching the Grid/List toggle in SchedulePage. Glyphs are
// decorative; each button carries a real label for assistive tech.
const OPTIONS: { value: Theme; label: string; glyph: string }[] = [
  { value: 'light', label: 'Light theme', glyph: '☀' },
  { value: 'dark', label: 'Dark theme', glyph: '☾' },
  { value: 'system', label: 'Match system theme', glyph: '◐' },
];

/**
 * Inside an event this sits in the profile menu (`fullWidth`), not the header:
 * on a phone the header had no room for a three-way segmented control beside
 * everything else, and theme is a preference you set once rather than a
 * control you reach for. The events list has no profile menu to hide it in,
 * so it stays in that header.
 */
export function ThemeToggle({ fullWidth = false }: { fullWidth?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      className={`flex shrink-0 rounded-lg border border-stone-300 bg-white p-0.5 dark:border-stone-600 dark:bg-stone-900 ${
        fullWidth ? 'w-full' : ''
      }`}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setTheme(option.value)}
          aria-label={option.label}
          aria-pressed={theme === option.value}
          className={`rounded-md px-2 py-1.5 text-xs font-medium leading-none ${
            fullWidth ? 'flex-1' : ''
          } ${
            theme === option.value
              ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
              : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
          }`}
        >
          <span aria-hidden="true">{option.glyph}</span>
        </button>
      ))}
    </div>
  );
}
