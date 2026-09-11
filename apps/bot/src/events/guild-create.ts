import type { Guild } from 'discord.js';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { ensureGuild, markGuildLeft, syncGuildMembers, syncGuildStructure } from '../core/guilds';
import { ensureScheduledAutomations } from '../services/automations';
import { postVerificationPanel } from '../services/verification';
import { incrementAnalytics } from '../services/analytics';
import type { BotEvent } from '../framework/types';

export const guildCreateEvent: BotEvent<'guildCreate'> = {
  name: 'guildCreate',
  async execute(guild: Guild) {
    const { log } = getContext();
    await ensureGuild({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      memberCount: guild.memberCount,
      shardId: guild.shardId,
    }).catch((err) => log.warn({ err: serializeError(err), guildId: guild.id }, 'guildCreate provisioning failed'));

    // Mirror roles + channels (idempotent upsert + prune) and backfill members.
    await syncGuildStructure(guild).catch((err) =>
      log.warn({ err: serializeError(err), guildId: guild.id }, 'guildCreate structure sync failed'),
    );
    await syncGuildMembers(guild).catch((err) =>
      log.warn({ err: serializeError(err), guildId: guild.id }, 'guildCreate member backfill failed'),
    );

    await ensureScheduledAutomations(guild.id).catch(() => undefined);
    await postVerificationPanel(guild).catch(() => undefined);
    await incrementAnalytics(guild.id, {}, guild.memberCount).catch(() => undefined);
    log.info({ guildId: guild.id, name: guild.name, memberCount: guild.memberCount }, 'Joined guild');
  },
};

export const guildDeleteEvent: BotEvent<'guildDelete'> = {
  name: 'guildDelete',
  async execute(guild: Guild) {
    const { log } = getContext();
    await markGuildLeft(guild.id).catch((err) =>
      log.warn({ err: serializeError(err), guildId: guild.id }, 'Failed to mark guild as left'),
    );
    log.info({ guildId: guild.id, name: guild.name }, 'Left guild');
  },
};
