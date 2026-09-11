import { PermissionFlagsBits, type GuildMember, type PartialGuildMember } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, toMessageOptions } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import type { MessagePayload } from '@nexora/types';
import { getContext } from '../core/context';
import { ensureGuildMember } from '../core/guilds';
import { safeJsonParse, formatDate } from '../core/utils';
import { dispatchAutomationTrigger } from '../services/automations';
import { handleMemberJoin as handleAntiRaidJoin } from '../services/antiraid';
import { startVerification } from '../services/verification';
import { logEvent } from '../services/logging';
import { incrementAnalytics } from '../services/analytics';
import type { BotEvent } from '../framework/types';

export const guildMemberAddEvent: BotEvent<'guildMemberAdd'> = {
  name: 'guildMemberAdd',
  async execute(member: GuildMember) {
    const { log } = getContext();
    const guild = member.guild;

    await ensureGuildMember(guild.id, member.id, member.joinedAt).catch((err) =>
      log.debug({ err: serializeError(err) }, 'Member provisioning failed'),
    );

    // Welcome message + DM + autoroles.
    const welcome = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } }).catch(() => null);
    if (welcome) {
      const templateContext = {
        user: `<@${member.id}>`,
        username: member.user.username,
        userid: member.id,
        server: guild.name,
        membercount: guild.memberCount,
        createdAt: formatDate(member.user.createdAt),
      };
      if (welcome.welcomeEnabled && welcome.welcomeChannelId) {
        const channel = await getContext().client.channels.fetch(welcome.welcomeChannelId).catch(() => null);
        const payload = safeJsonParse<MessagePayload>(welcome.welcomeMessage);
        if (channel?.isSendable()) {
          if (payload) {
            await channel.send(toMessageOptions(payload, templateContext)).catch(() => undefined);
          } else {
            await channel
              .send({
                embeds: [
                  brandEmbed()
                    .setTitle('Welcome!')
                    .setDescription(`Welcome **${member.user.username}** to **${guild.name}**!\nYou are member #${guild.memberCount}.`),
                ],
              })
              .catch(() => undefined);
          }
        }
      }
      if (welcome.welcomeDmEnabled) {
        const dmPayload = safeJsonParse<MessagePayload>(welcome.welcomeDmMessage);
        if (dmPayload) {
          await member.send(toMessageOptions(dmPayload, templateContext)).catch(() => undefined);
        }
      }
      const me = guild.members.me;
      if (welcome.autoRoleIds.length > 0 && me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        for (const roleId of welcome.autoRoleIds) {
          const role = guild.roles.cache.get(roleId);
          if (!role || role.position >= me.roles.highest.position) continue;
          await member.roles.add(role, 'Autorole').catch(() => undefined);
        }
      }
    }

    await startVerification(member).catch((err) =>
      log.warn({ err: serializeError(err), guildId: guild.id }, 'Verification start failed'),
    );
    await handleAntiRaidJoin(member).catch((err) =>
      log.warn({ err: serializeError(err), guildId: guild.id }, 'Anti-raid handling failed'),
    );
    await dispatchAutomationTrigger(guild, 'MEMBER_JOIN', { member, memberCount: guild.memberCount }).catch((err) =>
      log.debug({ err: serializeError(err) }, 'MEMBER_JOIN automation failed'),
    );
    await logEvent(guild, 'memberJoin', {
      action: `${member.user.tag} joined (account created ${formatDate(member.user.createdAt)})`,
      targetId: member.id,
      title: 'Member joined',
    }).catch(() => undefined);
    await incrementAnalytics(guild.id, { joins: 1 }, guild.memberCount).catch(() => undefined);
  },
};

export const guildMemberRemoveEvent: BotEvent<'guildMemberRemove'> = {
  name: 'guildMemberRemove',
  async execute(member: GuildMember | PartialGuildMember) {
    const { log } = getContext();
    const guild = member.guild;

    await prisma.guildMember
      .updateMany({ where: { guildId: guild.id, userId: member.id, leftAt: null }, data: { leftAt: new Date() } })
      .catch(() => undefined);

    const farewell = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } }).catch(() => null);
    if (farewell?.farewellEnabled && farewell.farewellChannelId) {
      const channel = await getContext().client.channels.fetch(farewell.farewellChannelId).catch(() => null);
      const payload = safeJsonParse<MessagePayload>(farewell.farewellMessage);
      if (channel?.isSendable()) {
        const templateContext = {
          user: `<@${member.id}>`,
          username: member.user?.username ?? member.displayName,
          userid: member.id,
          server: guild.name,
          membercount: guild.memberCount,
        };
        if (payload) {
          await channel.send(toMessageOptions(payload, templateContext)).catch(() => undefined);
        } else {
          await channel
            .send({ embeds: [brandEmbed().setColor(0xed4245).setDescription(`**${templateContext.username}** left the server.`)] })
            .catch(() => undefined);
        }
      }
    }

    await dispatchAutomationTrigger(guild, 'MEMBER_LEAVE', { userId: member.id, memberCount: guild.memberCount }).catch((err) =>
      log.debug({ err: serializeError(err) }, 'MEMBER_LEAVE automation failed'),
    );
    await logEvent(guild, 'memberLeave', {
      action: `${member.user?.tag ?? member.id} left the server`,
      targetId: member.id,
      title: 'Member left',
    }).catch(() => undefined);
    await incrementAnalytics(guild.id, { leaves: 1 }, guild.memberCount).catch(() => undefined);
  },
};
