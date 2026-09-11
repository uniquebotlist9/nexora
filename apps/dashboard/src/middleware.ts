import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Guard the dashboard: unauthenticated visitors are sent to the branded
 * sign-in page. Fine-grained per-guild access is enforced server-side in
 * layouts, pages and actions (this only checks "has a session at all").
 */
export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const signIn = new URL('/auth/signin', req.url);
    signIn.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
