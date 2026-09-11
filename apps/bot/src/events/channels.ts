import type { Channel, Guild, Role } from 'discord.js';
import { prisma } from '@nexora/database';
import { getContext } from '../core/context';
import { logEvent } from '../services/logging';
import { markTicketChannelDeleted } from '../services/tickets';
import type { BotEvent } from '../framework/types';

export const channelCreateEvent: BotEvent<'channelCreate'> = {
  name: 'channelCreate',
  async execute(channel: Channel) {
    if (!('guild' in channel) || !channel.guild || channel.isThread()) return;
    const guild: Guild = channel.guild;
    await prisma.channel
      .upsert({
        where: { id_guildId: { id: channel.id, guildId: guild.id } },
        create: { id: channel.id, guildId: guild.id, name: channel.name, type: String(channel.type), position: channel.rawPosition },
        update: { name: channel.name, type: String(channel.type), position: channel.rawPosition },
      })
      .catch(() => undefined);
    await logEvent(guild, 'channelChanges', {
      action: `Channel created: #${channel.name}`,
      eventChannelId: channel.id,
      metadata: { type: String(channel.type) },
      title: 'Channel created',
    });
  },
};

export const channelUpdateEvent: BotEvent<'channelUpdate'> = {
  name: 'channelUpdate',
  async execute(oldChannel: Channel, newChannel: Channel) {
    if (!('guild' in newChannel) || !newChannel.guild || newChannel.isThread()) return;
    const guild: Guild = newChannel.guild;
    const oldName = 'name' in oldChannel ? oldChannel.name : 'unknown';
    await prisma.channel
      .update({
        where: { id_guildId: { id: newChannel.id, guildId: guild.id } },
        data: { name: newChannel.name, type: String(newChannel.type), position: newChannel.rawPosition },
      })
      .catch(() => undefined);
    await logEvent(guild, 'channelChanges', {
      action: `Channel updated: #${oldName} → #${newChannel.name}`,
      eventChannelId: newChannel.id,
      title: 'Channel updated',
    });
  },
};

export const channelDeleteEvent: BotEvent<'channelDelete'> = {
  name: 'channelDelete',
  async execute(channel: Channel) {
    if (!('guild' in channel) || !channel.guild) return;
    const guild: Guild = channel.guild;
    await prisma.channel
      .deleteMany({ where: { id: channel.id, guildId: guild.id } })
      .catch(() => undefined);
    await markTicketChannelDeleted(channel.id).catch(() => undefined);
    await logEvent(guild, 'channelChanges', {
      action: `Channel deleted: #${channel.name}`,
      eventChannelId: channel.id,
      title: 'Channel deleted',
    });
  },
};

export const roleCreateEvent: BotEvent<'roleCreate'> = {
  name: 'roleCreate',
  async execute(role: Role) {
    await prisma.role
      .upsert({
        where: { id_guildId: { id: role.id, guildId: role.guild.id } },
        create: { id: role.id, guildId: role.guild.id, name: role.name, position: role.position, color: role.color },
        update: { name: role.name, position: role.position, color: role.color },
      })
      .catch(() => undefined);
    await logEvent(role.guild, 'roleChanges', {
      action: `Role created: @${role.name}`,
      targetId: role.id,
      title: 'Role created',
    });
  },
};

export const roleUpdateEvent: BotEvent<'roleUpdate'> = {
  name: 'roleUpdate',
  async execute(oldRole: Role, newRole: Role) {
    await prisma.role
      .update({
        where: { id_guildId: { id: newRole.id, guildId: newRole.guild.id } },
        data: { name: newRole.name, position: newRole.position, color: newRole.color },
      })
      .catch(() => undefined);
    if (oldRole.name !== newRole.name) {
      await logEvent(newRole.guild, 'roleChanges', {
        action: `Role renamed: @${oldRole.name} → @${newRole.name}`,
        targetId: newRole.id,
        title: 'Role updated',
      });
    }
  },
};

export const roleDeleteEvent: BotEvent<'roleDelete'> = {
  name: 'roleDelete',
  async execute(role: Role) {
    await prisma.role
      .deleteMany({ where: { id: role.id, guildId: role.guild.id } })
      .catch(() => undefined);
    await logEvent(role.guild, 'roleChanges', {
      action: `Role deleted: @${role.name}`,
      targetId: role.id,
      title: 'Role deleted',
    });
  },
};

export const guildUpdateEvent: BotEvent<'guildUpdate'> = {
  name: 'guildUpdate',
  async execute(oldGuild: Guild, newGuild: Guild) {
    await prisma.guild
      .update({
        where: { id: newGuild.id },
        data: { name: newGuild.name, icon: newGuild.icon, memberCount: newGuild.memberCount },
      })
      .catch(() => undefined);
    const changes: string[] = [];
    if (oldGuild.name !== newGuild.name) changes.push(`Name: ${oldGuild.name} → ${newGuild.name}`);
    if (oldGuild.icon !== newGuild.icon) changes.push('Icon changed');
    if (changes.length > 0) {
      await logEvent(newGuild, 'serverChanges', {
        action: changes.join('\n'),
        title: 'Server updated',
      });
    }
  },
};
