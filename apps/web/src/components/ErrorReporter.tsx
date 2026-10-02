'use client';
import { useEffect } from 'react';
import { reportError } from '@/lib/report';

/** catches errors nobody handled (a broken button, a failed promise) and reports them; renders nothing */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // only scripts from this site: extensions and other sites' scripts aren't ours to fix
      if (!e.filename || !e.filename.startsWith(location.origin)) return;
      reportError(e.error ?? e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
