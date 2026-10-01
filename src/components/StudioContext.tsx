'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';

export interface StudioUser {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_tone: string;
  status: string;
}

interface StudioState {
  /** null once loading finishes means nobody is signed in. */
  user: StudioUser | null;
  permissions: string[];
  /** The workflow database holds seeded demo data (statuses, grades, teams). */
  demo: boolean;
  /** The corpus this dashboard reads and publishes to. */
  corpusSource: { url: string; live: boolean };
  loading: boolean;
  /** True when the current role grants this permission. Drives every affordance. */
  can: (permission: string) => boolean;
  logout: () => Promise<void>;
  /** Re-reads identity, e.g. after the permission matrix changes. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<StudioState | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StudioUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [demo, setDemo] = useState(false);
  const [corpusSource, setCorpusSource] = useState({ url: '', live: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/session');
      const j = await res.json();
      if (!j.success) return;
      setUser(j.data.user);
      setPermissions(j.data.permissions);
      setDemo(!!j.data.demo);
      setCorpusSource(j.data.corpusSource);
    } catch {
      // A failed session read leaves `user` null, which sends the chrome to
      // the login screen — the right outcome either way.
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/session')
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.success) return;
        setUser(j.data.user);
        setPermissions(j.data.permissions);
        setDemo(!!j.data.demo);
        setCorpusSource(j.data.corpusSource);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/session', { method: 'DELETE' });
    // A hard navigation rather than router.push: signing out has to discard
    // every cached server component and all client state, which a soft
    // navigation deliberately preserves.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  }, []);

  const value = useMemo<StudioState>(
    () => ({
      user,
      permissions,
      demo,
      corpusSource,
      loading,
      can: (p: string) => permissions.includes(p),
      logout,
      refresh,
    }),
    [user, permissions, demo, corpusSource, loading, logout, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStudio must be used inside <StudioProvider>');
  return ctx;
}
