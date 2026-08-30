/**
 * Which build you are looking at, stamped by vite at build time.
 *
 * Demo instances show the tag and commit outright — a demo is a moving target
 * and "which build is this?" is the first thing you ask when something looks
 * wrong. Everywhere else it stays a quiet version string, with the commit and
 * build time in the tooltip, so it is there when you need it and invisible
 * when you do not.
 */
export function BuildInfo({ demo }: { demo: boolean }) {
  const commit = __BUILD_COMMIT__ + (__BUILD_DIRTY__ ? '-dirty' : '');
  const built = new Date(__BUILD_TIME__);
  const builtLabel = Number.isNaN(built.getTime()) ? 'unknown' : built.toISOString().slice(0, 16).replace('T', ' ');
  const full = `${__BUILD_TAG__} · ${commit} · built ${builtLabel} UTC`;

  return (
    <div className="pointer-events-none fixed bottom-2 right-2 z-40 flex justify-end">
      <span
        title={full}
        className={`pointer-events-auto select-all rounded-full px-2 py-0.5 font-mono text-[10px] leading-none ${
          demo
            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300'
            : 'bg-stone-200/60 text-stone-500 opacity-50 transition-opacity hover:opacity-100 dark:bg-stone-800/60 dark:text-stone-400'
        }`}
      >
        {demo ? `${__BUILD_TAG__} · ${commit}` : __BUILD_TAG__}
      </span>
    </div>
  );
}
