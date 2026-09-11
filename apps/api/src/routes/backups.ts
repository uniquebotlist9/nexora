import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { auditApiCall } from '../lib/audit';
import { parse, paginated, parsePagination, offset } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';
import type { AppDeps } from '../lib/deps';

const idParamSchema = z.object({ id: z.string().min(10).max(64) });

/**
 * GET /v1/guilds/:guildId/backups — paginated backup list (metadata only,
 * never the `data` blob).
 */
const listRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const { page, pageSize } = parsePagination(req.query);

  const where = { guildId: guild.id };
  const [total, items] = await Promise.all([
    prisma.backup.count({ where }),
    prisma.backup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset({ page, pageSize }),
      take: pageSize,
      select: {
        id: true,
        name: true,
        sizeBytes: true,
        checksum: true,
        scheduled: true,
        verified: true,
        createdAt: true,
      },
    }),
  ]);

  res.json(paginated(items, total, page, pageSize));
});

/**
 * POST /v1/guilds/:guildId/backups/:id/verify — recomputes the checksum over
 * the stored backup data and compares it with the recorded checksum.
 */
const verifyRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { id } = parse(idParamSchema, req.params, 'params');

  const backup = await prisma.backup.findFirst({
    where: { id, guildId: guild.id },
    select: { id: true, checksum: true, verified: true, data: true, sizeBytes: true },
  });
  if (!backup) throw new AppError(ERROR_CODES.NOT_FOUND, 'Backup not found', 404);

  const actual = createHash('sha256')
    .update(JSON.stringify(backup.data ?? {}))
    .digest('hex');
  const valid = actual === backup.checksum;

  if (valid && !backup.verified) {
    await prisma.backup.update({ where: { id }, data: { verified: true } });
  }

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.backup.verify',
    targetType: 'Backup',
    targetId: id,
    metadata: { valid },
  });

  res.json({
    backupId: id,
    valid,
    recordedChecksum: backup.checksum,
    computedChecksum: actual,
    verified: valid || backup.verified,
  });
});

export function backupsRouter(_deps: AppDeps): Router {
  const router = Router();
  router.get('/', requireScope(SCOPES.GUILDS_READ), listRoute);
  router.post('/:id/verify', requireScope(SCOPES.GUILDS_WRITE), verifyRoute);
  return router;
}
