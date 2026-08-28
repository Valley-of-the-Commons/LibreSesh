import { useCallback, useEffect, useState } from 'react';
import type { Me } from '@shared/types';
import { api } from './api';

/** The anonymous browser identity (SPEC §3.1). One fetch per page load; the
 *  cookie is minted server-side on first contact. */
export function useMe(): {
  me: Me | null;
  setMe: (me: Me) => void;
  refresh: () => Promise<void>;
} {
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch {
      // A failed /me is not fatal — the gate will surface the real problem.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { me, setMe, refresh };
}
