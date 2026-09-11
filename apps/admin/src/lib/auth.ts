import type { NextAuthOptions } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import { requireEnv } from '@nexora/config';
import { prisma } from '@nexora/database';
import { isAdminRole } from '@nexora/types';

/**
 * NextAuth (v4) configuration for the staff console.
 *
 * - Discord OAuth (`identify email`) using the SAME Discord application as the
 *   customer dashboard, but a SEPARATE next-auth instance:
 *     - its own secret (`AUTH_SECRET_ADMIN`), and
 *     - its own cookie names (`NEXTAUTH_ADMIN.*`), so a customer session on
 *       :3000 and a staff session on :3001 never collide.
 * - JWT sessions (no adapter — staff accounts live in AdminUser, not User).
 * - The sign-in callback DENIES any Discord user without an AdminUser row —
 *   no staff rows are ever created implicitly.
 */

// Cookie names are namespaced so this instance never shares state with the
// dashboard's default `next-auth.*` cookies on the same browser.
const useSecureCookies = process.env.NODE_ENV === 'production';
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

export const ADMIN_SESSION_COOKIES = [
  `${cookiePrefix}NEXTAUTH_ADMIN.session-token`,
] as const;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: useSecureCookies,
} as const;

export const authOptions: NextAuthOptions = {
  secret: requireEnv('AUTH_SECRET_ADMIN'),
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
      authorization: { params: { scope: 'identify email' } },
    }),
  ],
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}NEXTAUTH_ADMIN.session-token`,
      options: cookieOptions,
    },
    csrfToken: {
      name: `${cookiePrefix}NEXTAUTH_ADMIN.csrf-token`,
      options: cookieOptions,
    },
    callbackUrl: {
      name: `${cookiePrefix}NEXTAUTH_ADMIN.callback-url`,
      options: { ...cookieOptions, httpOnly: false },
    },
    state: {
      name: `${cookiePrefix}NEXTAUTH_ADMIN.state`,
      options: cookieOptions,
    },
    nonce: {
      name: `${cookiePrefix}NEXTAUTH_ADMIN.nonce`,
      options: cookieOptions,
    },
    pkceCodeVerifier: {
      name: `${cookiePrefix}NEXTAUTH_ADMIN.pkce-code-verifier`,
      options: cookieOptions,
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    /**
     * Gate: only Discord users present in the AdminUser table may sign in.
     * Returning a URL string redirects there instead of completing sign-in —
     * non-staff never receive a session.
     */
    async signIn({ profile }) {
      const discordId = (profile as { id?: string } | undefined)?.id;
      if (!discordId) {
        return '/access-denied';
      }
      const staff = await prisma.adminUser.findUnique({
        where: { userId: discordId },
        select: { id: true },
      });
      if (!staff) {
        return '/access-denied';
      }
      return true;
    },
    /**
     * Enrich every session with the live AdminUser role. Re-querying the DB
     * here (instead of freezing the role into the JWT) means role changes and
     * staff removals take effect on the very next request.
     */
    async session({ session, token }) {
      const discordId = token.sub ?? null;
      const staff = discordId
        ? await prisma.adminUser.findUnique({
            where: { userId: discordId },
            select: { role: true },
          })
        : null;
      session.user.id = discordId ?? '';
      // MongoDB stores the role as a plain string; a corrupted value must not
      // leak into the AdminRole-typed session.
      session.user.adminRole = staff && isAdminRole(staff.role) ? staff.role : null;
      return session;
    },
  },
};
