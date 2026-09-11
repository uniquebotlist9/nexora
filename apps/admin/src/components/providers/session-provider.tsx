'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

interface AppSessionProviderProps {
  session: Session | null;
  children: React.ReactNode;
}

/** Client session context wrapper (next-auth v4 App Router pattern). */
export function AppSessionProvider({ session, children }: AppSessionProviderProps) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
    </SessionProvider>
  );
}
