'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '@/components/layout/theme-provider';

/** Toast mount point, themed to match the active light/dark mode. */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'border border-border/60',
        },
      }}
    />
  );
}
