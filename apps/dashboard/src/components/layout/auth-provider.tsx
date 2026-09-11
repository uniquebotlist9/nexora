'use client';

import { SessionProvider } from 'next-auth/react';

/** Client-side session context so nested components can call useSession(). */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
