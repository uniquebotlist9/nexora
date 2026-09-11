import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { prisma, type Prisma } from '@nexora/database';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { getTicketConfig, parseTicketTypes, postTicketPanel } from '../../services/tickets';
import { getContext } from '../../core/context';
import { toJson } from '../../core/utils';

/** Typed passthrough so subcommand handlers share one update call. */
function updateTicketConfig(guildId: string, data: Prisma.TicketConfigUpdateInput): Promise<unknown> {
  return prisma.ticketConfig.update({ where: { guildId }, data });
}

async function postPanelIn(guildId: string, channelId: string): Promise<boolean> {
  const { client } = getContext();
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  const message = await postTicketPanel(channel);
  return message !== null;
}

export const ticketsCommand: BotCommand = {
  data: guildCommand('tickets', 'Configure the ticket system', PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Enable tickets and set the panel channel')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Channel for the ticket panel').setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((option) =>
          option.setName('transcripts').setDescription('Channel for transcripts').setRequired(false).addChannelTypes(ChannelType.GuildText),
        )
        .addIntegerOption((option) =>
          option.setName('inactivity_hours').setDescription('Auto-close after N hours of inactivity').setRequired(false).setMinValue(1).setMaxValue(720),
        ),
    )
    .addSubcommand((sub) => sub.setName('panel').setDescription('Post the ticket panel in its configured channel'))
    .addSubcommand((sub) =>
      sub
        .setName('addtype')
        .setDescription('Add a ticket type')
        .addStringOption((option) => option.setName('id').setDescription('Short id, e.g. support').setRequired(true).setMaxLength(50))
        .addStringOption((option) => option.setName('name').setDescription('Display name').setRequired(true).setMaxLength(100))
        .addStringOption((option) => option.setName('description').setDescription('Description').setRequired(false).setMaxLength(200)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('removetype')
        .setDescription('Remove a ticket type')
        .addStringOption((option) => option.setName('id').setDescription('Type id').setRequired(true).setMaxLength(50)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List ticket types and configuration'))
    .addSubcommand((sub) =>
      sub
        .setName('staffrole')
        .setDescription('Add or remove a staff role')
        .addRoleOption((option) => option.setName('role').setDescription('Staff role').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('blacklist')
        .setDescription('Add or remove a blacklisted user')
        .addUserOption((option) => option.setName('user').setDescription('User').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('claimrequired')
        .setDescription('Toggle whether tickets must be claimed')
        .addBooleanOption((option) => option.setName('required').setDescription('Claim required?').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable the ticket system')),
  category: 'tickets',
  cooldownSeconds: 3,
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      const transcripts = interaction.options.getChannel('transcripts');
      const inactivityHours = interaction.options.getInteger('inactivity_hours');
      const config = await getTicketConfig(guild.id);
      const types = parseTicketTypes(config);
      if (types.length === 0) {
        types.push({ id: 'support', name: 'Support', description: 'General help and support' });
      }
      await updateTicketConfig(guild.id, {
        enabled: true,
        panelChannelId: channel.id,
        ...(transcripts ? { transcriptChannelId: transcripts.id } : {}),
        ...(inactivityHours !== null ? { inactivityHours } : {}),
        types: toJson(types),
      });
      const panelPosted = await postPanelIn(guild.id, channel.id);
      await interaction.editReply({
        content: '',
        embeds: [
          successEmbed(
            `Tickets enabled${panelPosted ? ` — panel posted in <#${channel.id}>` : ` — panel channel set to <#${channel.id}>`}.`,
          ),
        ],
      });
      return;
    }

    if (sub === 'panel') {
      const config = await getTicketConfig(guild.id);
      if (!config.panelChannelId) {
        await interaction.editReply({ content: '', embeds: [warnEmbed('No panel channel configured. Use /tickets setup first.')] });
        return;
      }
      const posted = await postPanelIn(guild.id, config.panelChannelId);
      await interaction.editReply({
        content: '',
        embeds: [posted ? successEmbed('Panel posted.') : warnEmbed('Could not post the panel (no ticket types configured?).')],
      });
      return;
    }

    if (sub === 'addtype') {
      const id = interaction.options.getString('id', true).toLowerCase().replace(/\s+/g, '-');
      const name = interaction.options.getString('name', true);
      const description = interaction.options.getString('description') ?? '';
      const config = await getTicketConfig(guild.id);
      const types = parseTicketTypes(config);
      if (types.some((type) => type.id === id)) {
        await interaction.editReply({ content: '', embeds: [warnEmbed('A ticket type with that id already exists.')] });
        return;
      }
      if (types.length >= 25) {
        await interaction.editReply({ content: '', embeds: [warnEmbed('You can have at most 25 ticket types.')] });
        return;
      }
      types.push({ id, name, description });
      await updateTicketConfig(guild.id, { types: toJson(types) });
      await interaction.editReply({ content: '', embeds: [successEmbed(`Ticket type **${name}** (\`${id}\`) added.`)] });
      return;
    }

    if (sub === 'removetype') {
      const id = interaction.options.getString('id', true).toLowerCase();
      const config = await getTicketConfig(guild.id);
      const types = parseTicketTypes(config);
      const next = types.filter((type) => type.id !== id);
      if (next.length === types.length) {
        await interaction.editReply({ content: '', embeds: [warnEmbed('No ticket type with that id.')] });
        return;
      }
      await updateTicketConfig(guild.id, { types: toJson(next) });
      await interaction.editReply({ content: '', embeds: [successEmbed('Ticket type removed.')] });
      return;
    }

    if (sub === 'list') {
      const config = await getTicketConfig(guild.id);
      const types = parseTicketTypes(config);
      await interaction.editReply({
        content: '',
        embeds: [
          brandEmbed()
            .setTitle('Ticket configuration')
            .addFields(
              { name: 'Enabled', value: config.enabled ? 'Yes' : 'No', inline: true },
              { name: 'Panel channel', value: config.panelChannelId ? `<#${config.panelChannelId}>` : 'Not set', inline: true },
              { name: 'Transcripts', value: config.transcriptChannelId ? `<#${config.transcriptChannelId}>` : 'Not set', inline: true },
              { name: 'Inactivity', value: `${config.inactivityHours}h`, inline: true },
              { name: 'Claim required', value: config.claimRequired ? 'Yes' : 'No', inline: true },
              { name: 'Staff roles', value: config.staffRoleIds.map((id) => `<@&${id}>`).join(' ') || 'None', inline: true },
              { name: 'Types', value: types.map((type) => `\`${type.id}\` — ${type.name}`).join('\n') || 'None', inline: false },
            ),
        ],
      });
      return;
    }

    if (sub === 'staffrole') {
      const role = interaction.options.getRole('role', true);
      const config = await getTicketConfig(guild.id);
      const roles = config.staffRoleIds;
      const next = roles.includes(role.id) ? roles.filter((id) => id !== role.id) : [...roles, role.id];
      await updateTicketConfig(guild.id, { staffRoleIds: next });
      await interaction.editReply({
        content: '',
        embeds: [successEmbed(`**${role.name}** ${next.includes(role.id) ? 'added to' : 'removed from'} ticket staff.`)],
      });
      return;
    }

    if (sub === 'blacklist') {
      const user = interaction.options.getUser('user', true);
      const config = await getTicketConfig(guild.id);
      const blacklist = config.blacklist;
      const next = blacklist.includes(user.id) ? blacklist.filter((id) => id !== user.id) : [...blacklist, user.id];
      await updateTicketConfig(guild.id, { blacklist: next });
      await interaction.editReply({
        content: '',
        embeds: [successEmbed(`**${user.tag}** ${next.includes(user.id) ? 'added to' : 'removed from'} the ticket blacklist.`)],
      });
      return;
    }

    if (sub === 'claimrequired') {
      const required = interaction.options.getBoolean('required', true);
      await updateTicketConfig(guild.id, { claimRequired: required });
      await interaction.editReply({ content: '', embeds: [successEmbed(`Claim required: **${required ? 'yes' : 'no'}**.`)] });
      return;
    }

    // disable
    await updateTicketConfig(guild.id, { enabled: false });
    await interaction.editReply({ content: '', embeds: [successEmbed('Ticket system disabled.')] });
  },
};

