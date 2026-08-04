import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Helmet, HelmetProvider, type HelmetServerState } from 'react-helmet-async';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isPreviewEnvironment } from '@/lib/environment';

const queryClient = new QueryClient();

const PreviewNoindexGuard = () => {
  if (!isPreviewEnvironment()) return null;

  return (
    <Helmet>
      <meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex" />
    </Helmet>
  );
};

interface AppProvidersProps {
  children: React.ReactNode;
  helmetContext?: { helmet?: HelmetServerState };
}

/** Shared client/server providers used by both hydration and build-time rendering. */
export const AppProviders: React.FC<AppProvidersProps> = ({ children, helmetContext }) => (
  <HelmetProvider context={helmetContext}>
    <PreviewNoindexGuard />
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {children}
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </HelmetProvider>
);

export default AppProviders;
