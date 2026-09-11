import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { parse } from '../lib/http';

const leaderboardQuerySchema = z.object({
  type: z.enum(['xp', 'economy']).default('xp'),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * GET /v1/guilds/:guildId/leaderboard?type=xp|economy — top members.
 */
const leaderboardRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const q = parse(leaderboardQuerySchema, req.query, 'query');

  if (q.type === 'xp') {
    const members = await prisma.guildMember.findMany({
      where: { guildId: guild.id, leftAt: null },
      orderBy: [{ xp: 'desc' }],
      take: q.limit,
      include: { level: { select: { level: true, totalXp: true } } },
    });
    res.json({
      type: 'xp',
      items: members.map((m, index) => ({
        rank: index + 1,
        userId: m.userId,
        xp: m.xp,
        level: m.level?.level ?? 0,
        totalXp: m.level?.totalXp ?? m.xp,
      })),
    });
    return;
  }

  const accounts = await prisma.economyAccount.findMany({
    where: { guildId: guild.id },
    orderBy: [{ balance: 'desc' }],
    take: q.limit,
  });
  res.json({
    type: 'economy',
    items: accounts.map((a, index) => ({
      rank: index + 1,
      userId: a.userId,
      balance: a.balance,
      bank: a.bank,
      netWorth: a.balance + a.bank,
    })),
  });
});

export function leaderboardRouter(): Router {
  const router = Router();
  router.get('/', requireScope(SCOPES.GUILDS_READ), leaderboardRoute);
  return router;
}
