import { useEffect, useState } from 'react';
import type { LinkCodeDto } from '@shared/types';
import { api } from '../lib/api';
import { Modal, SecondaryButton, Spinner } from './ui';

/**
 * Shows a fresh link phrase (SPEC §3.1 follow-up): type it on another device
 * and that device becomes *you* — same name, role, stars and sessions. Minted
 * on open so the ten-minute clock starts when someone is actually looking.
 */
export function DeviceLinkModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState<LinkCodeDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mint = () => {
    setCode(null);
    setError(null);
    api
      .mintLinkCode()
      .then(setCode)
      .catch((err: unknown) => setError((err as Error).message));
  };

  useEffect(mint, []);

  return (
    <Modal title="Link another device" onClose={onClose}>
      <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">
        On your other device, open this event’s password page and choose{' '}
        <span className="font-medium">“I’m already here on another device”</span>, then type
        this phrase. That device becomes you — same name, role and starred sessions.
      </p>

      {error && <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!code && !error && <Spinner label="Minting a phrase…" />}

      {code && (
        <>
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-5 text-center font-mono text-lg font-semibold tracking-wide dark:border-stone-700 dark:bg-stone-800">
            {code.phrase}
          </div>
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            Works once and expires in 10 minutes. Anyone who types it becomes you, so don’t
            post it anywhere public.
          </p>
        </>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <SecondaryButton onClick={mint}>New phrase</SecondaryButton>
        <SecondaryButton onClick={onClose}>Done</SecondaryButton>
      </div>
    </Modal>
  );
}
