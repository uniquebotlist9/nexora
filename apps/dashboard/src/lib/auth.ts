import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import DiscordProvider from 'next-auth/providers/discord';
import { prisma } from '@nexora/database';
import { canManageGuild, isGuildAdministrator } from '@nexora/permissions';
import type { DashboardGuildAccess } from '@nexora/types';

/** How long the cached guild list in the JWT stays fresh. */
const GUILDS_CACHE_MS = 5 * 60 * 1000;

interface DiscordGuildPartial {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

async function refreshDiscordToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID ?? '',
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken ?? '',
      }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Token refresh failed with status ${res.status}`);
    const data = (await res.json()) as DiscordTokenResponse;
    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshTokenError' };
  }
}

async function fetchManageableGuilds(accessToken: string): Promise<DashboardGuildAccess[]> {
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const guilds = (await res.json()) as DiscordGuildPartial[];
    return guilds
      .map((g) => ({
        guildId: g.id,
        name: g.name,
        icon: g.icon,
        permissions: g.permissions,
        canManage: g.owner || canManageGuild(g.permissions),
        isAdmin: g.owner || isGuildAdministrator(g.permissions),
      }))
      .filter((g) => g.canManage || g.isAdmin)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export const authOptions: NextAuthOptions = {
  // Read at module init — this module is only ever imported by runtime
  // server code (route handlers / server components), never at build time.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/signin', error: '/auth/error' },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
      authorization: { params: { scope: 'identify email guilds' } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      // Initial sign-in — persist the OAuth tokens and upsert the platform user.
      if (account && user) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ? account.expires_at * 1000 : undefined;
        token.sub = user.id;
        try {
          await prisma.user.upsert({
            where: { id: user.id },
            create: { id: user.id },
            update: { lastSeenAt: new Date() },
          });
        } catch {
          // Non-fatal: the dashboard works without the user row existing yet.
        }
      }

      // Refresh the access token shortly before it expires.
      if (token.expiresAt && token.refreshToken && Date.now() > token.expiresAt - 60_000) {
        token = await refreshDiscordToken(token);
      }

      // Cache the user's manageable guilds on the JWT (refreshed periodically
      // so page loads don't hit the Discord API on every request).
      const stale =
        !token.guildsFetchedAt || Date.now() - token.guildsFetchedAt > GUILDS_CACHE_MS;
      if (token.accessToken && (stale || token.error === 'RefreshTokenError')) {
        const guilds = await fetchManageableGuilds(token.accessToken);
        if (guilds.length > 0 || !token.guilds) {
          token.guilds = guilds;
        }
        token.guildsFetchedAt = Date.now();
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      session.accessToken = token.accessToken;
      session.guilds = token.guilds ?? [];
      return session;
    },
  },
};
