'use client';
import { useEffect, useSyncExternalStore } from 'react';
import type { Me } from '@store/shared';
import { api } from './api';

/* The logged-in shopper, shared by the header, checkout and account pages.
   undefined = still checking, null = logged out. */
let me: Me | null | undefined;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setMe(next: Me | null) {
  me = next;
  emit();
}

export function refreshMe() {
  loading ??= api
    .me()
    .then(setMe, () => setMe(null))
    .finally(() => {
      loading = null;
    });
  return loading;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useMe() {
  const value = useSyncExternalStore(subscribe, () => me, () => undefined);
  useEffect(() => {
    if (me === undefined) void refreshMe();
  }, []);
  return value;
}

export async function logout() {
  await api.logout().catch(() => undefined);
  setMe(null);
}
