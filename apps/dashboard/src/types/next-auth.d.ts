import type { DefaultSession } from 'next-auth';
import type { DashboardGuildAccess } from '@nexora/types';

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'] & {
      id: string;
    };
    /** Discord OAuth access token — server-side only, never shipped to the client payload. */
    accessToken?: string;
    /** Guilds the user can manage (Manage Server or Administrator). */
    guilds?: DashboardGuildAccess[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
    guilds?: DashboardGuildAccess[];
    guildsFetchedAt?: number;
  }
}
