import type { Guild } from '@nexora/database';
import { prisma } from '@nexora/database';
import type { Request } from 'express';
import { AppError, ERROR_CODES } from './errors';

/**
 * Guild access model for the REST API.
 *
 * The API never sees Discord permission bitfields (those live in the dashboard
 * session / bot gateway context), so staff access is derived from what the bot
 * already knows: a GuildMember row flagged `isStaff` (maintained by the bot from
 * role-based staff configuration). Endpoints additionally require that the bot
 * is currently in the guild (`botLeftAt` is null).
 */

/** Get the guild attached by `requireGuildAccess`, or throw 500 if misused. */
export function requireGuild(req: Request): Guild {
  if (!req.guild) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Guild context missing on request', 500);
  }
  return req.guild;
}

/** Does `userId` currently have staff access to `guildId`? */
export async function isGuildStaff(userId: string, guildId: string): Promise<boolean> {
  const membership = await prisma.guildMember.findFirst({
    where: { userId, guildId, isStaff: true, leftAt: null },
    select: { id: true },
  });
  return membership !== null;
}
