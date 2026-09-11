import { GuildMember, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { errorId, serializeError } from '@nexora/logger';
import { prisma } from '@nexora/database';
import { errorEmbed } from '@nexora/discord';
import { getContext } from '../core/context';
import { getGuildSettings } from '../core/guilds';
import { t } from '../core/i18n';
import { toJson } from '../core/utils';
import { incrementAnalytics } from '../services/analytics';
import type { BotCommand, CommandContext } from './types';
import { getCommand } from '../commands/registry';

/** Extract a compact, JSON-safe snapshot of the invoked options for audit logs. */
function serializeOptions(interaction: ChatInputCommandInteraction): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const option of interaction.options.data) {
    const value = option.value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[option.name] = value;
    } else {
      out[option.name] = '[resolved]';
    }
  }
  return out;
}

async function replyError(
  interaction: ChatInputCommandInteraction,
  message: string,
): Promise<void> {
  if (interaction.replied) {
    await interaction.followUp({ embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral }).catch(() => undefined);
  } else if (interaction.deferred) {
    await interaction.editReply({ embeds: [errorEmbed(message)] }).catch(() => undefined);
  } else {
    await interaction.reply({ embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral }).catch(() => undefined);
  }
}

/**
 * Central command execution pipeline:
 * guild/member resolution → provisioning → disabled check → cooldown →
 * member/bot permission validation → stats + audit → execute with global
 * error handling.
 */
export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = getCommand(interaction.commandName);
  if (!command) return;

  const { log, cache } = getContext();

  if (!interaction.inGuild() || !interaction.guild) {
    await replyError(interaction, t('common.guildOnly'));
    return;
  }
  const guild = interaction.guild;
  const member =
    interaction.member instanceof GuildMember
      ? interaction.member
      : await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await replyError(interaction, t('common.invalidTarget'));
    return;
  }

  const settings = await getGuildSettings(guild.id);
  const language = settings.language;
  const translate = (key: string, vars: Record<string, string | number> = {}): string =>
    t(key, vars, language);

  // ---- Disabled commands -------------------------------------------------
  if (settings.disabledCommands.includes(command.data.name)) {
    await replyError(interaction, translate('common.commandDisabled'));
    return;
  }

  // ---- Cooldown (cache-backed, per user+command+guild) --------------------
  const cooldownSeconds = Math.max(command.cooldownSeconds ?? settings.commandCooldownSeconds, 0);
  if (cooldownSeconds > 0) {
    const key = `cooldown:${guild.id}:${interaction.user.id}:${command.data.name}`;
    const count = await cache.incrTtl(key, cooldownSeconds);
    if (count > 1) {
      const remaining = await cache.ttl(key);
      await replyError(interaction, translate('common.cooldown', { seconds: Math.max(remaining, 1) }));
      return;
    }
  }

  // ---- Member permissions -------------------------------------------------
  if (command.memberPermissions && command.memberPermissions.length > 0) {
    for (const bit of command.memberPermissions) {
      if (!member.permissions.has(bit)) {
        await replyError(interaction, translate('common.noPermission'));
        return;
      }
    }
  }

  // ---- Bot permissions ----------------------------------------------------
  if (command.botPermissions && command.botPermissions.length > 0) {
    const me = guild.members.me;
    for (const bit of command.botPermissions) {
      if (!me?.permissions.has(bit)) {
        await replyError(interaction, translate('common.botNoPermission'));
        return;
      }
    }
  }

  // ---- Stats + audit (fire-and-forget, never blocks execution) -----------
  const optionSnapshot = serializeOptions(interaction);
  prisma.commandStat
    .upsert({
      where: { commandName_guildId: { commandName: command.data.name, guildId: guild.id } },
      create: { commandName: command.data.name, guildId: guild.id, uses: 1 },
      update: { uses: { increment: 1 }, lastUsedAt: new Date() },
    })
    .catch((err) => log.warn({ err: serializeError(err) }, 'Failed to update command stat'));

  prisma.auditLog
    .create({
      data: {
        actorType: 'USER',
        actorId: interaction.user.id,
        guildId: guild.id,
        action: `command.${command.data.name}`,
        targetType: 'COMMAND',
        targetId: command.data.name,
        metadata: toJson({ options: optionSnapshot, shard: interaction.channelId }),
      },
    })
    .catch((err) => log.warn({ err: serializeError(err) }, 'Failed to write command audit log'));

  incrementAnalytics(guild.id, { commandsUsed: 1 }).catch(() => undefined);

  // ---- Execute -------------------------------------------------------------
  const ctx: CommandContext = { interaction, guild, member, settings, t: translate };
  try {
    await command.execute(ctx);
  } catch (err) {
    const id = errorId();
    log.error(
      { err: serializeError(err), errorId: id, command: command.data.name, guildId: guild.id, userId: interaction.user.id },
      'Command execution failed',
    );
    await replyError(interaction, translate('common.errorOccurred', { id }));
  }
}
