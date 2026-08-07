import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

const DefaultErrorFallback = ({ error }: { error?: Error }) => (
  <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-orange-600">Banners On The Fly</p>
      <h1 className="mt-3 text-2xl font-bold text-slate-950">This page needs a quick refresh</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Your design and cart are saved in this browser. Reload to reconnect to the latest version of the site.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 rounded-lg bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
      >
        Reload page
      </button>
      {import.meta.env.DEV && error?.message ? (
        <pre className="mt-6 overflow-auto rounded-lg bg-slate-950 p-3 text-left text-xs text-slate-100">{error.message}</pre>
      ) : null}
    </section>
  </main>
);

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <DefaultErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}
