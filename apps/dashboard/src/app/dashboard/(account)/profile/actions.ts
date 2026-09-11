'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { isPlanTier, limitsForPlan } from '@nexora/types';
import { getSession } from '@/lib/guild';
import { ok, err, zodFieldErrors, type ActionResult } from '@/lib/result';
import {
  API_KEY_PREFIX,
  API_KEY_SCOPE_VALUES,
  MAX_API_KEY_RATE_LIMIT,
  MAX_KEY_ACTIONS_PER_MINUTE,
} from '@/lib/api-keys';

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedApiKey {
  key: ApiKeyView;
  /** Shown exactly once — never stored, only its sha256 hash is. */
  keyRaw: string;
}

/** Same shape as the API package's createKeySchema (POST /v1/keys). */
const createKeySchema = z.object({
  name: z.string().trim().min(1, 'Give the key a name.').max(100, 'Name is too long (max 100).'),
  scopes: z
    .array(z.string())
    .min(1, 'Pick at least one scope.')
    .refine(
      (scopes) => scopes.every((s) => API_KEY_SCOPE_VALUES.includes(s)),
      'Unknown scope selected.',
    ),
  rateLimitPerMinute: z
    .number()
    .int()
    .min(1, 'Rate limit must be at least 1 request/minute.')
    .max(MAX_API_KEY_RATE_LIMIT, 'Rate limit can be at most 600 requests/minute.')
    .default(60),
});

const idSchema = z.object({ id: z.string().min(1).max(64) });

/** User plan = the most recently updated active user-level subscription, else FREE. */
async function resolveUserPlan(userId: string): Promise<'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE'> {
  const sub = await prisma.subscription.findFirst({
    where: { guildId: null, userId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { plan: true },
  });
  return sub && isPlanTier(sub.plan) ? sub.plan : 'FREE';
}

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Create an API key. Plan-gated (FREE has 0 keys) and rate-limited to
 * MAX_KEY_ACTIONS_PER_MINUTE creations per minute, mirroring the API package.
 * The raw key is returned exactly once; only its sha256 hash is stored.
 */
export async function createApiKey(input: {
  name: string;
  scopes: string[];
  rateLimitPerMinute: number;
}): Promise<ActionResult<CreatedApiKey>> {
  const session = await getSession();
  if (!session?.user?.id) return err('Your session has expired — please sign in again.');

  const parsed = createKeySchema.safeParse(input);
  if (!parsed.success) {
    return err('Please fix the highlighted fields.', zodFieldErrors(parsed.error));
  }

  try {
    const plan = await resolveUserPlan(session.user.id);
    const limits = limitsForPlan(plan);

    if (limits.apiKeys <= 0) {
      return err('API keys are not available on the FREE plan. Upgrade to PRO or higher.');
    }

    // Per-user creation limiter (DB-backed equivalent of the API's cache limiter).
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const recent = await prisma.apiKey.count({
      where: { userId: session.user.id, createdAt: { gte: oneMinuteAgo } },
    });
    if (recent >= MAX_KEY_ACTIONS_PER_MINUTE) {
      return err('Too many key actions in a short time — please wait a minute and try again.');
    }

    const activeKeys = await prisma.apiKey.count({
      where: { userId: session.user.id, revokedAt: null },
    });
    if (activeKeys >= limits.apiKeys) {
      return err(
        `API key limit reached (${limits.apiKeys} keys on the ${plan} plan). Revoke a key first or upgrade your plan.`,
      );
    }

    const rawKey = API_KEY_PREFIX + randomBytes(32).toString('hex');
    const key = await prisma.apiKey.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        keyHash: hashApiKey(rawKey),
        prefix: rawKey.slice(0, 8),
        scopes: parsed.data.scopes,
        rateLimitPerMinute: parsed.data.rateLimitPerMinute,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: session.user.id,
        action: 'api.key.create',
        targetType: 'API_KEY',
        targetId: key.id,
        metadata: {
          name: key.name,
          scopes: key.scopes,
          rateLimitPerMinute: key.rateLimitPerMinute,
        } as never,
      },
    });

    revalidatePath('/dashboard/profile');
    return ok({
      key: {
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scopes: key.scopes,
        rateLimitPerMinute: key.rateLimitPerMinute,
        createdAt: key.createdAt.toISOString(),
        lastUsedAt: null,
        revokedAt: null,
      },
      keyRaw: rawKey,
    });
  } catch {
    return err('Could not create the API key. Please try again.');
  }
}

/** Revoke an API key (soft delete — the key stops authenticating immediately). */
export async function revokeApiKey(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.user?.id) return err('Your session has expired — please sign in again.');

  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return err('Invalid API key reference.');

  try {
    // Ownership: users may only revoke their own keys.
    const key = await prisma.apiKey.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, name: true, revokedAt: true },
    });
    if (!key) return err('API key not found.');
    if (key.revokedAt) return err('This key is already revoked.');

    await prisma.apiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: session.user.id,
        action: 'api.key.revoke',
        targetType: 'API_KEY',
        targetId: key.id,
        metadata: { name: key.name } as never,
      },
    });

    revalidatePath('/dashboard/profile');
    return ok();
  } catch {
    return err('Could not revoke the API key. Please try again.');
  }
}
