import { NextResponse, type NextRequest } from 'next/server';
import { getInviteUrl } from '@/lib/discord';

/**
 * Bot invite redirect. Kept as a route handler (not an inline link) so the
 * invite URL is always built from the runtime DISCORD_CLIENT_ID and the
 * marketing pages can stay statically rendered.
 */
export async function GET(req: NextRequest) {
  const guildId = req.nextUrl.searchParams.get('guild_id') ?? undefined;
  const url = getInviteUrl(guildId);
  // Missing client id would produce a broken OAuth screen — bounce home instead.
  if (!process.env.DISCORD_CLIENT_ID) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.redirect(url);
}
