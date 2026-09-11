import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { deleteReactionRolePanel, listReactionRolePanels, postReactionRolePanel, type ReactionRoleOption } from '../../services/reaction-roles';
import { parseRoleMentions, truncate } from '../../core/utils';

/**
 * Parse option lines like: `<@&123> | Label | 🎮 | optional description`
 * (role mention required, label required, emoji and description optional).
 */
function parseOptionLines(input: string): { options: ReactionRoleOption[]; error?: string } {
  const options: ReactionRoleOption[] = [];
  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const segments = line.split('|').map((part) => part.trim());
    const roleId = parseRoleMentions(segments[0] ?? '')[0];
    if (!roleId) return { options: [], error: `Line "${truncate(line, 50)}" is missing a role mention.` };
    const label = segments[1];
    if (!label) return { options: [], error: `Line "${truncate(line, 50)}" is missing a label.` };
    options.push({
      roleId,
      label: truncate(label, 80),
      emoji: segments[2] || undefined,
      description: segments[3] || undefined,
    });
  }
  if (options.length === 0) return { options: [], error: 'Provide at least one option line.' };
  if (options.length > 25) return { options: [], error: 'At most 25 options per panel.' };
  return { options };
}

export const rolesCommand: BotCommand = {
  data: guildCommand('roles', 'Manage reaction role panels', PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('post')
        .setDescription('Post a reaction role panel')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Channel for the panel').setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option.setName('title').setDescription('Panel title').setRequired(true).setMaxLength(256),
        )
        .addStringOption((option) =>
          option
            .setName('options')
            .setDescription('One per line: @role | Label | emoji | description')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('style')
            .setDescription('Panel style')
            .setRequired(false)
            .addChoices({ name: 'Buttons', value: 'BUTTON' }, { name: 'Dropdown', value: 'DROPDOWN' }),
        )
        .addBooleanOption((option) => option.setName('single_choice').setDescription('Only allow one role at a time').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a role panel')
        .addStringOption((option) => option.setName('message_id').setDescription('Panel message ID').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List role panels')),
  category: 'roles',
  botPermissions: [PermissionFlagsBits.ManageRoles],
  cooldownSeconds: 5,
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();

    if (sub === 'post') {
      const resolvedChannel = interaction.options.getChannel('channel', true);
      const title = interaction.options.getString('title', true);
      const optionsInput = interaction.options.getString('options', true);
      const style = (interaction.options.getString('style') ?? 'BUTTON') as 'BUTTON' | 'DROPDOWN';
      const singleChoice = interaction.options.getBoolean('single_choice') ?? false;

      const parsed = parseOptionLines(optionsInput);
      if (parsed.error || parsed.options.length === 0) {
        await interaction.reply({ embeds: [warnEmbed(parsed.error ?? 'Invalid options.')], flags: MessageFlags.Ephemeral });
        return;
      }
      // Hierarchy check: the bot must be able to manage every offered role.
      const me = guild.members.me;
      for (const option of parsed.options) {
        const role = guild.roles.cache.get(option.roleId);
        if (!role) {
          await interaction.reply({ embeds: [warnEmbed(`The role for "${option.label}" no longer exists.`)], flags: MessageFlags.Ephemeral });
          return;
        }
        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position) {
          await interaction.reply({
            embeds: [warnEmbed(`I cannot manage **${role.name}** — it must be below my highest role.`)],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channel = await guild.channels.fetch(resolvedChannel.id).catch(() => null);
      if (!channel?.isTextBased()) {
        await interaction.editReply({ content: '', embeds: [warnEmbed('Pick a text channel.')] });
        return;
      }
      const messageId = await postReactionRolePanel(guild, channel, {
        title,
        options: parsed.options,
        style,
        singleChoice,
      });
      await interaction.editReply({
        content: '',
        embeds: [
          messageId
            ? successEmbed(`Role panel posted in <#${channel.id}>.`)
            : warnEmbed('I could not post the panel (check my permissions there).'),
        ],
      });
      return;
    }

    if (sub === 'delete') {
      const messageId = interaction.options.getString('message_id', true);
      const deleted = await deleteReactionRolePanel(guild.id, messageId);
      await interaction.reply({
        embeds: [deleted ? successEmbed('Role panel deleted.') : warnEmbed('No panel with that message ID.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // list
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const panels = await listReactionRolePanels(guild.id);
    await interaction.editReply({
      content: '',
      embeds: [
        brandEmbed()
          .setTitle('Role panels')
          .setDescription(
            panels.length === 0
              ? 'No panels configured. Use /roles post to create one.'
              : panels.map((panel) => `<#${panel.channelId}> — \`${panel.messageId}\` (${panel.style.toLowerCase()}, ${panel.title})`).join('\n'),
          ),
      ],
    });
  },
};
