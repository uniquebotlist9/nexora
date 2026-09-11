import { AuditLogEvent, PermissionFlagsBits, type GuildBan } from 'discord.js';
import { prisma } from '@nexora/database';
import { getContext } from '../core/context';
import { truncate } from '../core/utils';
import { createCase, closeActiveCases } from '../services/moderation';
import { logEvent } from '../services/logging';
import type { BotEvent } from '../framework/types';

export const guildBanAddEvent: BotEvent<'guildBanAdd'> = {
  name: 'guildBanAdd',
  async execute(ban: GuildBan) {
    const guild = ban.guild;

    // Case sync: if no active bot-issued ban case exists, create a synced one
    // (attempting to attribute a moderator from the audit log).
    const activeCase = await prisma.moderationCase.findFirst({
      where: { guildId: guild.id, targetUserId: ban.user.id, type: { in: ['BAN', 'TEMPBAN'] }, active: true },
      select: { id: true },
    });
    if (!activeCase) {
      let moderatorId: string | null = null;
      const me = guild.members.me;
      if (me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
        const auditEntries = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 5 }).catch(() => null);
        const entry = auditEntries?.entries.find((candidate) => candidate.target?.id === ban.user.id);
        moderatorId = entry?.executor?.id ?? null;
      }
      await createCase({
        guildId: guild.id,
        type: 'BAN',
        targetUserId: ban.user.id,
        moderatorId: moderatorId ?? getContext().client.user?.id ?? null,
        reason: truncate(ban.reason ?? 'Banned via Discord (no reason provided)', 1000),
      });
    }

    await logEvent(guild, 'ban', {
      action: `Member banned${ban.reason ? ` — ${truncate(ban.reason, 400)}` : ''}`,
      targetId: ban.user.id,
      title: 'Member banned',
    });
  },
};

export const guildBanRemoveEvent: BotEvent<'guildBanRemove'> = {
  name: 'guildBanRemove',
  async execute(ban: GuildBan) {
    const guild = ban.guild;
    await closeActiveCases(guild.id, ban.user.id, ['BAN', 'TEMPBAN']).catch(() => undefined);
    await logEvent(guild, 'unban', {
      action: 'Member unbanned',
      targetId: ban.user.id,
      title: 'Member unbanned',
    });
  },
};
