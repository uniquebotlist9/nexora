import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SIGN_IN_PATH = '/login';

// Cookie names must mirror lib/auth.ts (NEXTAUTH_ADMIN.* namespace, with the
// __Secure- prefix in production) — this instance is isolated from the
// dashboard's default `next-auth.*` cookies.
const ADMIN_SESSION_COOKIES = [
  'NEXTAUTH_ADMIN.session-token',
  '__Secure-NEXTAUTH_ADMIN.session-token',
];

/** Pages that must be reachable without a session. */
const PUBLIC_PATHS = ['/login', '/access-denied', '/no-access'];

function hasSessionCookie(req: NextRequest): boolean {
  return ADMIN_SESSION_COOKIES.some((name) => req.cookies.has(name));
}

/**
 * Coarse edge guard: unauthenticated visitors are bounced to the sign-in page
 * before any server component runs. Real authentication + role checks happen
 * server-side (getServerSession / requireAdmin / guardAction), so a forged
 * cookie buys nothing — every gate re-checks the session against the
 * AdminUser table.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = SIGN_IN_PATH;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth/).*)'],
};
