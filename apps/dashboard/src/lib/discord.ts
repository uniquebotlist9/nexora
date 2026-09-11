/**
 * Discord API / OAuth helpers. All env access is lazy (runtime, server-only).
 */

export function getInviteUrl(guildId?: string): string {
  const clientId = process.env.DISCORD_CLIENT_ID ?? '';
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: '8',
    scope: 'bot applications.commands',
  });
  if (guildId) params.set('guild_id', guildId);
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function hasDiscordCredentials(): boolean {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

export function guildIconUrl(guildId: string, icon: string | null, size = 64): string | null {
  if (!icon) return null;
  const ext = icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=${size}`;
}

export function userAvatarUrl(userId: string, avatar: string | null, size = 64): string | null {
  if (!avatar) return null;
  const ext = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=${size}`;
}

/** Default avatar index derived from a Discord user id (for the placeholder look). */
export function defaultAvatarIndex(userId: string): number {
  try {
    return Number(BigInt(userId || '0') % 6n);
  } catch {
    return 0;
  }
}
