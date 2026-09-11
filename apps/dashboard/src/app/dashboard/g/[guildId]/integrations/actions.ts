'use server';

import { revalidatePath } from 'next/cache';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@nexora/database';
import { webhookEndpointInputSchema } from '@nexora/validation';
import { getSession, assertGuildAccess } from '@/lib/guild';
import { ok, err, zodFieldErrors, type ActionResult } from '@/lib/result';

function generateSecret(): string {
  return `nxw_${randomBytes(24).toString('hex')}`;
}

/** Create a webhook endpoint; returns the raw signing secret ONCE. */
export async function createWebhookEndpoint(
  guildId: string,
  input: { name: string; url: string; events: string[] },
): Promise<ActionResult<{ secret: string }>> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = webhookEndpointInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid webhook configuration', zodFieldErrors(parsed.error));

  const session = await getSession();
  if (!session?.user?.id) return err('Session expired — please sign in again.');

  try {
    const secret = generateSecret();
    await prisma.webhookEndpoint.create({
      data: {
        guildId,
        ownerId: session.user.id,
        name: parsed.data.name,
        url: parsed.data.url,
        events: parsed.data.events,
        secret,
        status: 'PENDING',
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/integrations`);
    return ok({ secret });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return err('An endpoint with that name already exists.');
    return err('Could not create the webhook endpoint.');
  }
}

export async function deleteWebhookEndpoint(guildId: string, endpointId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.webhookEndpoint.deleteMany({ where: { id: endpointId, guildId } });
    revalidatePath(`/dashboard/g/${guildId}/integrations`);
    return ok();
  } catch {
    return err('Could not delete the endpoint.');
  }
}

/** Create a developer API key; returns the raw key ONCE (only hash is stored). */
export async function createApiKey(
  _guildId: string,
  input: { name: string; scopes: string[] },
): Promise<ActionResult<{ key: string }>> {
  const session = await getSession();
  if (!session?.user?.id) return err('Session expired — please sign in again.');

  if (!input.name.trim()) return err('A key name is required.');
  const existing = await prisma.apiKey.count({ where: { userId: session.user.id, revokedAt: null } });
  // Plan limit for API keys is user-level; default FREE = 0. Check the guild plan of the caller.
  const { getGuildPlan } = await import('@/lib/guild');
  const plan = await getGuildPlan(_guildId);
  const { limitsForPlan } = await import('@nexora/types');
  const limit = limitsForPlan(plan).apiKeys;
  if (existing >= limit) {
    return err(`Your ${plan} plan allows ${limit} active API keys. Upgrade for more.`);
  }

  try {
    const raw = `nxk_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(raw).digest('hex');
    await prisma.apiKey.create({
      data: {
        userId: session.user.id,
        name: input.name.trim(),
        keyHash,
        prefix: raw.slice(0, 8),
        scopes: input.scopes,
      },
    });
    revalidatePath(`/dashboard/g/${_guildId}/integrations`);
    return ok({ key: raw });
  } catch {
    return err('Could not create the API key.');
  }
}

export async function revokeApiKey(_guildId: string, keyId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.user?.id) return err('Session expired — please sign in again.');
  try {
    await prisma.apiKey.updateMany({
      where: { id: keyId, userId: session.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    revalidatePath(`/dashboard/g/${_guildId}/integrations`);
    return ok();
  } catch {
    return err('Could not revoke the key.');
  }
}
