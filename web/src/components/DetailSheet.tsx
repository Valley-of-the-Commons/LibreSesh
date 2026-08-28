import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  ContributionDto,
  ContributionKind,
  Me,
  RoomDto,
  Role,
  SessionDto,
  TagDto,
} from '@shared/types';
import { fmtMin, place, relativeTime } from '../lib/format';
import { renderMarkdown } from '../lib/markdown';
import { PrimaryButton, SecondaryButton, inputClass } from './ui';

const KIND_LABEL: Record<ContributionKind, string> = {
  question: 'Questions',
  note: 'Notes',
  link: 'Links',
};
const KINDS: ContributionKind[] = ['question', 'note', 'link'];

export interface DetailSheetProps {
  session: SessionDto;
  slug: string;
  rooms: RoomDto[];
  tags: TagDto[];
  contributions: ContributionDto[] | undefined;
  role: Role;
  me: Me | null;
  timezone: string;
  canEdit: boolean;
  archived: boolean;
  /** The event's word for the middle role, used in the upgrade prompt. */
  userLabel: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAdd: (kind: ContributionKind, body: string, url?: string) => Promise<void>;
  onRemoveContribution: (id: number) => void;
  onToggleHidden: (contribution: ContributionDto) => void;
}

/** Bottom sheet on mobile, side panel from `sm` up (SPEC §7.4). */
export function DetailSheet({
  session,
  slug,
  rooms,
  tags,
  contributions,
  role,
  me,
  timezone,
  canEdit,
  archived,
  userLabel,
  onClose,
  onEdit,
  onDelete,
  onAdd,
  onRemoveContribution,
  onToggleHidden,
}: DetailSheetProps) {
  const [kind, setKind] = useState<ContributionKind>('question');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [posting, setPosting] = useState(false);

  const room = rooms.find((r) => r.id === session.roomId);
  const { startMin, endMin } = place(session, timezone);
  const description = useMemo(
    () => (session.description ? renderMarkdown(session.description) : ''),
    [session.description],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canContribute = role !== 'viewer' && !archived;

  const submit = async () => {
    if (!body.trim() || posting) return;
    setPosting(true);
    try {
      await onAdd(kind, body.trim(), kind === 'link' ? url.trim() : undefined);
      setBody('');
      setUrl('');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={session.title}>
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-stone-900/30"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-stone-200 bg-white p-5 shadow-xl sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:h-auto sm:max-h-[92vh] sm:w-96 sm:rounded-2xl">
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {session.type === 'open' ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  open session
                </span>
              ) : (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
                  official
                </span>
              )}
              {session.tagIds.map((id) => {
                const tag = tags.find((t) => t.id === id);
                if (!tag) return null;
                return (
                  <span
                    key={id}
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ background: tag.color }}
                  >
                    {tag.name}
                  </span>
                );
              })}
            </div>
            <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">
              {session.title}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              {fmtMin(startMin)}–{fmtMin(endMin)} · {room?.name ?? 'unknown room'} ·{' '}
              {session.speakerId ? (
                <Link to={`/e/${slug}/p/${session.speakerId}`} className="text-blue-700 underline">
                  {session.speaker}
                </Link>
              ) : (
                session.speaker || 'no speaker yet'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100"
          >
            ✕
          </button>
        </div>

        {description && (
          <div
            className="prose-sm mb-4 text-sm leading-relaxed text-stone-700 [&_a]:text-blue-700 [&_a]:underline [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1 [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2"
            // Markdown is escaped before parsing, so no author markup survives.
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}

        {canEdit && !archived && (
          <div className="mb-4 flex gap-2">
            <SecondaryButton className="flex-1 py-1.5" onClick={onEdit}>
              Edit session
            </SecondaryButton>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}

        {contributions === undefined ? (
          <p className="mb-3 text-sm text-stone-400">Loading contributions…</p>
        ) : (
          <>
            {KINDS.map((k) => {
              const items = contributions.filter((c) => c.kind === k);
              if (items.length === 0) return null;
              return (
                <div key={k} className="mb-3">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    {KIND_LABEL[k]}
                  </h3>
                  <ul className="space-y-1.5">
                    {items.map((c) => (
                      <li
                        key={c.id}
                        className={`group rounded-lg px-3 py-2 text-sm ${
                          c.hidden ? 'bg-red-50' : 'bg-stone-50'
                        }`}
                      >
                        {c.kind === 'link' && c.url ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-700 underline"
                          >
                            {c.body} ↗
                          </a>
                        ) : (
                          <span className="whitespace-pre-wrap text-stone-800">{c.body}</span>
                        )}
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-400">
                          <span className="truncate">
                            {c.createdByName} · {relativeTime(c.createdAt)}
                            {c.hidden && ' · hidden'}
                          </span>
                          {role === 'admin' && !archived && (
                            <button
                              type="button"
                              onClick={() => onToggleHidden(c)}
                              className="ml-auto shrink-0 text-stone-500 underline hover:text-stone-800"
                            >
                              {c.hidden ? 'unhide' : 'hide'}
                            </button>
                          )}
                          {!archived && (role === 'admin' || c.createdBy === me?.id) && (
                            <button
                              type="button"
                              onClick={() => onRemoveContribution(c.id)}
                              className={`shrink-0 text-red-500 underline ${
                                role === 'admin' ? '' : 'ml-auto'
                              }`}
                            >
                              remove
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {contributions.length === 0 && (
              <p className="mb-3 text-sm text-stone-400">No notes, links or questions yet.</p>
            )}
          </>
        )}

        {archived ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
            This event is archived — it is read-only now.
          </p>
        ) : !canContribute ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
            Enter the {userLabel} password (tap your name, top right) to add notes, links and
            questions.
          </p>
        ) : (
          <div className="rounded-xl border border-stone-200 p-3">
            <div className="mb-2 flex gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    kind === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={kind === 'link' ? 'Link label' : `Add a ${kind}…`}
              className={`${inputClass} resize-none`}
            />
            {kind === 'link' && (
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                className={`${inputClass} mt-1.5`}
              />
            )}
            <PrimaryButton
              className="mt-2 w-full py-1.5"
              onClick={() => void submit()}
              disabled={!body.trim() || posting}
            >
              Post as {me?.displayName ?? 'you'}
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
