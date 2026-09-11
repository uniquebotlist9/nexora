import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { brandEmbed, buildEmbed, successEmbed } from '@nexora/discord';
import type { EmbedData } from '@nexora/types';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';

function parseHexColor(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const match = input.replace('#', '').match(/^([0-9a-fA-F]{6})$/);
  if (!match) return undefined;
  return Number.parseInt(match[1], 16);
}

export const embedCommand: BotCommand = {
  data: guildCommand('embed', 'Build and send a custom embed', PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName('send')
        .setDescription('Send an embed to a channel')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Target channel').setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) => option.setName('description').setDescription('Embed description').setRequired(true).setMaxLength(4000))
        .addStringOption((option) => option.setName('title').setDescription('Embed title').setRequired(false).setMaxLength(256))
        .addStringOption((option) => option.setName('color').setDescription('Hex color, e.g. #5865F2').setRequired(false))
        .addStringOption((option) => option.setName('image_url').setDescription('Image URL').setRequired(false))
        .addStringOption((option) => option.setName('thumbnail_url').setDescription('Thumbnail URL').setRequired(false))
        .addStringOption((option) => option.setName('footer').setDescription('Footer text').setRequired(false).setMaxLength(2000))
        .addStringOption((option) => option.setName('field1_name').setDescription('Field 1 name').setRequired(false).setMaxLength(256))
        .addStringOption((option) => option.setName('field1_value').setDescription('Field 1 value').setRequired(false).setMaxLength(1024))
        .addStringOption((option) => option.setName('field2_name').setDescription('Field 2 name').setRequired(false).setMaxLength(256))
        .addStringOption((option) => option.setName('field2_value').setDescription('Field 2 value').setRequired(false).setMaxLength(1024))
        .addStringOption((option) => option.setName('field3_name').setDescription('Field 3 name').setRequired(false).setMaxLength(256))
        .addStringOption((option) => option.setName('field3_value').setDescription('Field 3 value').setRequired(false).setMaxLength(1024)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('preview')
        .setDescription('Preview an embed without sending it')
        .addStringOption((option) => option.setName('description').setDescription('Embed description').setRequired(true).setMaxLength(4000))
        .addStringOption((option) => option.setName('title').setDescription('Embed title').setRequired(false).setMaxLength(256))
        .addStringOption((option) => option.setName('color').setDescription('Hex color').setRequired(false)),
    ),
  category: 'utility',
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();

    const fields: EmbedData['fields'] = [];
    for (const index of [1, 2, 3]) {
      const name = interaction.options.getString(`field${index}_name`);
      const value = interaction.options.getString(`field${index}_value`);
      if (name && value) fields.push({ name, value, inline: true });
    }

    const embedData: EmbedData = {
      title: interaction.options.getString('title') ?? undefined,
      description: interaction.options.getString('description', true),
      color: parseHexColor(interaction.options.getString('color') ?? undefined) ?? 0x5865f2,
      image: interaction.options.getString('image_url') ?? undefined,
      thumbnail: interaction.options.getString('thumbnail_url') ?? undefined,
      ...(interaction.options.getString('footer') ? { footer: { text: interaction.options.getString('footer') as string } } : {}),
      ...(fields.length > 0 ? { fields } : {}),
    };

    const built = buildEmbed(embedData);
    if (!built) {
      await interaction.reply({ content: 'Could not build the embed.', ephemeral: true });
      return;
    }

    if (sub === 'preview') {
      await interaction.reply({ embeds: [built] });
      return;
    }

    const resolved = interaction.options.getChannel('channel', true);
    const channel = await guild.channels.fetch(resolved.id).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: 'Pick a text channel.', ephemeral: true });
      return;
    }
    const sent = await channel.send({ embeds: [built] }).then(
      () => true,
      () => false,
    );
    await interaction.reply({
      embeds: [sent ? successEmbed(`Embed sent to <#${channel.id}>.`) : brandEmbed().setColor(0xed4245).setDescription('I could not send the embed in that channel.')],
      ephemeral: true,
    });
  },
};

export const announceCommand: BotCommand = {
  data: guildCommand('announce', 'Send an announcement to a channel', PermissionFlagsBits.ManageMessages)
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Announcement channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) => option.setName('message').setDescription('Announcement text').setRequired(true).setMaxLength(1800))
    .addStringOption((option) => option.setName('title').setDescription('Embed title').setRequired(false).setMaxLength(256))
    .addBooleanOption((option) => option.setName('mention_everyone').setDescription('Ping @everyone?').setRequired(false)),
  category: 'utility',
  cooldownSeconds: 10,
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const message = interaction.options.getString('message', true);
    const title = interaction.options.getString('title');
    const mention = interaction.options.getBoolean('mention_everyone') ?? false;

    const resolved = interaction.options.getChannel('channel', true);
    const target = await guild.channels.fetch(resolved.id).catch(() => null);
    if (!target?.isSendable()) {
      await interaction.reply({ content: 'Pick a text channel.', ephemeral: true });
      return;
    }
    const embed = brandEmbed()
      .setTitle(title ?? '📣 Announcement')
      .setDescription(message)
      .setFooter({ text: `Announced by ${interaction.user.tag}` })
      .setTimestamp(new Date());
    const sent = await target
      .send({ content: mention ? '@everyone' : undefined, embeds: [embed] })
      .then(() => true)
      .catch(() => false);
    await interaction.reply({
      embeds: [sent ? successEmbed(`Announcement posted in <#${target.id}>.`) : brandEmbed().setColor(0xed4245).setDescription('I could not send the announcement in that channel.')],
      ephemeral: true,
    });
  },
};
