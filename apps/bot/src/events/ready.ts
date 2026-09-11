import { ActivityType, type Client } from 'discord.js';
import { serializeError } from '@nexora/logger';
import { getContext, isPrimaryWorker } from '../core/context';
import { ensureGuild, syncGuildMembers, syncGuildStructure } from '../core/guilds';
import { ensureScheduledAutomations } from '../services/automations';
import { resumePendingTasks, startScheduler } from '../services/scheduler';
import { postVerificationPanel } from '../services/verification';
import type { BotEvent } from '../framework/types';

export const readyEvent: BotEvent<'ready'> = {
  name: 'ready',
  once: true,
  async execute(client: Client<true>) {
    const { log } = getContext();
    log.info(
      { user: client.user.tag, guilds: client.guilds.cache.size, shards: client.shard?.ids ?? [0] },
      'Bot is ready',
    );

    client.user.setPresence({
      status: 'online',
      activities: [{ name: 'Nexora • /help', type: ActivityType.Watching }],
    });

    // Provision every cached guild and re-sync its structure + member list.
    for (const guild of client.guilds.cache.values()) {
      await ensureGuild({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        memberCount: guild.memberCount,
        ...(guild.shardId !== undefined ? { shardId: guild.shardId } : {}),
      }).catch((err) => log.warn({ err: serializeError(err), guildId: guild.id }, 'Guild provisioning failed'));
      await syncGuildStructure(guild).catch((err) =>
        log.warn({ err: serializeError(err), guildId: guild.id }, 'Guild structure sync failed'),
      );
      await syncGuildMembers(guild).catch((err) =>
        log.warn({ err: serializeError(err), guildId: guild.id }, 'Guild member backfill failed'),
      );

      await ensureScheduledAutomations(guild.id).catch((err) =>
        log.warn({ err: serializeError(err), guildId: guild.id }, 'Scheduled automation re-arm failed'),
      );
      await postVerificationPanel(guild).catch(() => undefined);
    }

    if (isPrimaryWorker(client)) {
      await resumePendingTasks().catch((err) =>
        log.error({ err: serializeError(err) }, 'Failed to resume pending scheduled tasks'),
      );
      startScheduler();
    }
  },
};
