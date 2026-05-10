import { FormEvent, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { isPreviewEnvironment, isProductionHost } from './lib/environment';

const PREVIEW_SESSION_KEY = 'preview_access_granted';

declare global {
  interface Window {
    __ENV__?: {
      VITE_PREVIEW_ACCESS_PASSWORD?: string;
    };
  }
}

function getPreviewAccessPassword(): string {
  const vitePassword = import.meta.env.VITE_PREVIEW_ACCESS_PASSWORD;

  if (typeof vitePassword === 'string' && vitePassword.length > 0) {
    return vitePassword;
  }

  if (typeof window !== 'undefined') {
    const runtimePassword = window.__ENV__?.VITE_PREVIEW_ACCESS_PASSWORD;
    if (typeof runtimePassword === 'string' && runtimePassword.length > 0) {
      return runtimePassword;
    }
  }

  return '';
}

function PreviewAccessGate() {
  const expectedPassword = getPreviewAccessPassword();
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (isPreviewEnvironment()) {
    console.log('[preview-gate] env present:', !!expectedPassword);
  }

  const isConfigured = useMemo(() => {
    return typeof expectedPassword === 'string' && expectedPassword.length > 0;
  }, [expectedPassword]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isConfigured) {
      return;
    }

    if (password === expectedPassword) {
      sessionStorage.setItem(PREVIEW_SESSION_KEY, 'true');
      window.location.reload();
      return;
    }

    setErrorMessage('Invalid preview password.');
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Preview Access</h1>
        <p className="mt-2 text-sm text-slate-600">Enter the password to continue.</p>

        {!isConfigured ? (
          <p className="mt-4 text-sm font-medium text-red-600">Preview access is not configured.</p>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrorMessage('');
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              autoComplete="current-password"
              placeholder="Password"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Enter Preview
            </button>
            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
          </form>
        )}
      </div>
    </main>
  );
}

function shouldRequirePreviewGate(): boolean {
  if (typeof window === 'undefined') return false;

  const hostname = window.location.hostname;
  if (isProductionHost(hostname)) return false;
  if (!isPreviewEnvironment(hostname)) return false;

  const hasAccess = sessionStorage.getItem(PREVIEW_SESSION_KEY) === 'true';
  return !hasAccess;
}

const RootComponent = shouldRequirePreviewGate() ? PreviewAccessGate : App;

createRoot(document.getElementById('root')!).render(<RootComponent />);

import './buildId';
