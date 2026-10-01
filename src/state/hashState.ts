import { useCallback, useEffect, useState } from 'react';

/** View state lives in the URL hash so a view can be bookmarked and shared. */
export type HashParams = Record<string, string>;

function readHash(): HashParams {
  return Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)));
}

export function useHashParams(): [HashParams, (patch: HashParams) => void] {
  const [params, setParams] = useState(readHash);

  // Follow links and manual edits of the hash; replaceState below does not fire this event.
  useEffect(() => {
    const onHashChange = () => setParams(readHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const update = useCallback((patch: HashParams) => {
    setParams((prev) => {
      const next = { ...prev, ...patch };
      for (const [k, v] of Object.entries(next)) if (v === '') delete next[k];
      const hash = new URLSearchParams(next).toString();
      window.history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname + window.location.search);
      return next;
    });
  }, []);

  return [params, update];
}
