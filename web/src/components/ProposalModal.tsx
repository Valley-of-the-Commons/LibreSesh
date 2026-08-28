import { useState } from 'react';
import type { PersonDto, ProposalDto, TagDto } from '@shared/types';
import type { ProposalWrite } from '../lib/api';
import { Chip, Field, Modal, PrimaryButton, SecondaryButton, inputClass } from './ui';

export interface ProposalModalProps {
  proposal?: ProposalDto;
  people: PersonDto[];
  tags: TagDto[];
  saving: boolean;
  onCancel: () => void;
  onSave: (body: ProposalWrite) => void;
  onDelete?: () => void;
}

/** Pitch a session with no room or time yet — mirrors SessionModal's
 *  select-or-new speaker pattern (SPEC §8). */
export function ProposalModal({
  proposal,
  people,
  tags,
  saving,
  onCancel,
  onSave,
  onDelete,
}: ProposalModalProps) {
  const [title, setTitle] = useState(proposal?.title ?? '');
  const [description, setDescription] = useState(proposal?.description ?? '');
  const [speakerId, setSpeakerId] = useState<number | null>(proposal?.speakerId ?? null);
  const [addingSpeaker, setAddingSpeaker] = useState(false);
  const [newSpeaker, setNewSpeaker] = useState('');
  const [tagIds, setTagIds] = useState<number[]>(proposal?.tagIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!title.trim()) {
      setError('A title is required');
      return;
    }
    const newName = newSpeaker.trim();
    onSave({
      title: title.trim(),
      description: description.trim(),
      ...(addingSpeaker && newName ? { speakerName: newName } : { speakerId }),
      tagIds,
    });
  };

  return (
    <Modal title={proposal ? 'Edit pitch' : 'Pitch a session'} onClose={onCancel}>
      <p className="-mt-2 mb-3 text-xs text-stone-500 dark:text-stone-400">
        Pitches have no room or time. An organiser places the popular ones on the grid.
      </p>

      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className={inputClass}
          autoFocus
        />
      </Field>
      <Field label="Speaker / host">
        <select
          value={addingSpeaker ? 'new' : speakerId === null ? '' : String(speakerId)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'new') {
              setAddingSpeaker(true);
              setSpeakerId(null);
            } else {
              setAddingSpeaker(false);
              setSpeakerId(v ? Number(v) : null);
            }
          }}
          className={inputClass}
        >
          <option value="">— none —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="new">+ Add someone new</option>
        </select>
        {addingSpeaker && (
          <input
            value={newSpeaker}
            onChange={(e) => setNewSpeaker(e.target.value)}
            maxLength={120}
            placeholder="Their name"
            className={`${inputClass} mt-1.5`}
          />
        )}
      </Field>
      <Field label="Description" hint="Markdown is supported.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={5000}
          className={`${inputClass} resize-none`}
        />
      </Field>

      <Field label="Tags">
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && (
            <span className="text-xs text-stone-400 dark:text-stone-500">No tags yet.</span>
          )}
          {tags.map((t) => (
            <Chip
              key={t.id}
              dot={t.color}
              active={tagIds.includes(t.id)}
              onClick={() =>
                setTagIds((prev) =>
                  prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                )
              }
            >
              {t.name}
            </Chip>
          ))}
        </div>
      </Field>

      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 flex gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-200 dark:border-red-900 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            Withdraw
          </button>
        )}
        <SecondaryButton className="ml-auto" onClick={onCancel}>
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </PrimaryButton>
      </div>
    </Modal>
  );
}
