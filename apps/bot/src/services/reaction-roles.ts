import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type Guild,
  type TextBasedChannel,
} from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { safeJsonParse, truncate } from '../core/utils';
import { registerComponentHandler } from '../framework/router';

export interface ReactionRoleOption {
  roleId: string;
  label: string;
  description?: string;
  emoji?: string;
}

export interface PostPanelOptions {
  title: string;
  options: ReactionRoleOption[];
  style: 'BUTTON' | 'DROPDOWN';
  singleChoice: boolean;
}

/**
 * Post a reaction-role panel. `customId`s are stateless ("rr:toggle:<roleId>"
 * / "rr:select"), so panels keep working across restarts; the authoritative
 * options live on the ReactionRoleMessage row.
 */
export async function postReactionRolePanel(
  guild: Guild,
  channel: TextBasedChannel,
  options: PostPanelOptions,
): Promise<string | null> {
  if (!channel.isSendable()) return null;
  if (options.options.length === 0) return null;
  const limited = options.options.slice(0, 25);

  const embed = brandEmbed()
    .setTitle(truncate(options.title || 'Select your roles', 256))
    .setDescription('Click a button below to receive or remove the matching role.')
    .setFooter({ text: options.singleChoice ? 'Single choice — picking one removes others.' : 'You can pick multiple roles.' });

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  if (options.style === 'BUTTON') {
    const buttons = limited.slice(0, 25).map((option) => {
      const builder = new ButtonBuilder()
        .setCustomId(`rr:toggle:${option.roleId}`)
        .setLabel(truncate(option.label, 80))
        .setStyle(ButtonStyle.Secondary);
      if (option.emoji) builder.setEmoji(option.emoji);
      return builder;
    });
    for (let i = 0; i < buttons.length; i += 5) {
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(i, i + 5)));
    }
  } else {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('rr:select')
      .setPlaceholder('Select your roles…')
      .setMinValues(1)
      .setMaxValues(options.singleChoice ? 1 : Math.min(limited.length, 25))
      .addOptions(
        ...limited.map((option) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(truncate(option.label, 100))
            .setValue(option.roleId)
            .setDescription(truncate(option.description ?? `Toggle ${option.label}`, 100)),
        ),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  const message = await channel.send({ embeds: [embed], components }).catch(() => null);
  if (!message) return null;

  await prisma.reactionRoleMessage.upsert({
    where: { guildId_messageId: { guildId: guild.id, messageId: message.id } },
    create: {
      guildId: guild.id,
      channelId: channel.id,
      messageId: message.id,
      style: options.style,
      title: options.title,
      options: JSON.parse(JSON.stringify(limited)),
      singleChoice: options.singleChoice,
    },
    update: {
      style: options.style,
      title: options.title,
      options: JSON.parse(JSON.stringify(limited)),
      singleChoice: options.singleChoice,
    },
  });
  return message.id;
}

async function toggleRole(
  guild: Guild,
  userId: string,
  roleId: string,
  add: boolean,
): Promise<'added' | 'removed' | 'denied'> {
  const me = guild.members.me;
  const role = guild.roles.cache.get(roleId);
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || !role) return 'denied';
  if (role.position >= me.roles.highest.position) return 'denied';
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return 'denied';
  if (add) {
    await member.roles.add(role, 'Reaction role').catch(() => undefined);
    return 'added';
  }
  await member.roles.remove(role, 'Reaction role').catch(() => undefined);
  return 'removed';
}

async function fetchPanel(guildId: string, messageId: string) {
  const panel = await prisma.reactionRoleMessage.findUnique({
    where: { guildId_messageId: { guildId, messageId } },
  });
  if (!panel) return null;
  return {
    panel,
    options: safeJsonParse<ReactionRoleOption[]>(panel.options) ?? [],
  };
}

registerComponentHandler('rr', async (interaction, parts) => {
  const guild = interaction.guild;
  if (!guild) return;
  const { log } = getContext();

  if (interaction.isButton() && parts[1] === 'toggle' && parts[2]) {
    const roleId = parts[2];
    const panel = await fetchPanel(guild.id, interaction.message.id);
    if (!panel || !panel.options.some((option) => option.roleId === roleId)) {
      await interaction.reply({ content: 'This role panel is no longer active.', flags: MessageFlags.Ephemeral }).catch(() => undefined);
      return;
    }
    // Single-choice panels: remove the other roles first.
    const member = interaction.member instanceof GuildMember ? interaction.member : null;
    if (panel.panel.singleChoice && member) {
      for (const option of panel.options) {
        if (option.roleId === roleId) continue;
        if (member.roles.cache.has(option.roleId)) {
          await toggleRole(guild, interaction.user.id, option.roleId, false).catch((err) =>
            log.warn({ err: serializeError(err) }, 'Reaction role cleanup failed'),
          );
        }
      }
    }
    const has = member ? member.roles.cache.has(roleId) : false;
    const result = await toggleRole(guild, interaction.user.id, roleId, !has);
    await interaction
      .reply({
        content:
          result === 'denied'
            ? 'I cannot manage that role. Please contact a moderator.'
            : result === 'added'
              ? 'Role added. ✅'
              : 'Role removed. ✅',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => undefined);
    return;
  }

  if (interaction.isStringSelectMenu() && parts[1] === 'select') {
    const panel = await fetchPanel(guild.id, interaction.message.id);
    if (!panel) {
      await interaction.reply({ content: 'This role panel is no longer active.', flags: MessageFlags.Ephemeral }).catch(() => undefined);
      return;
    }
    const selected = interaction.values;
    const member = interaction.member instanceof GuildMember ? interaction.member : null;
    const current = member ? panel.options.filter((o) => member.roles.cache.has(o.roleId)).map((o) => o.roleId) : [];
    const target = panel.panel.singleChoice ? selected.slice(0, 1) : selected;

    for (const option of panel.options) {
      const shouldHave = target.includes(option.roleId);
      const has = current.includes(option.roleId);
      if (shouldHave !== has) {
        await toggleRole(guild, interaction.user.id, option.roleId, shouldHave).catch(() => undefined);
      }
    }
    await interaction
      .reply({ content: 'Your roles have been updated. ✅', flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
  }
});

/** REACTION-style panels: add/remove role based on raw message reactions. */
export async function handleReactionRoleReaction(
  guild: Guild,
  messageId: string,
  emojiId: string,
  userId: string,
  added: boolean,
): Promise<void> {
  if (userId === getContext().client.user?.id) return;
  const panel = await prisma.reactionRoleMessage.findUnique({
    where: { guildId_messageId: { guildId: guild.id, messageId } },
  });
  if (!panel || panel.style !== 'REACTION') return;
  const options = safeJsonParse<ReactionRoleOption[]>(panel.options) ?? [];
  const option = options.find((entry) => (entry.emoji ?? '') === emojiId);
  if (!option) return;
  await toggleRole(guild, userId, option.roleId, added);
}

export async function listReactionRolePanels(guildId: string) {
  return prisma.reactionRoleMessage.findMany({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}

export async function deleteReactionRolePanel(guildId: string, messageId: string): Promise<boolean> {
  const result = await prisma.reactionRoleMessage.deleteMany({ where: { guildId, messageId } });
  return result.count > 0;
}
