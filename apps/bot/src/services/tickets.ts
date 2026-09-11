import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type Guild,
  type Message,
  type StringSelectMenuInteraction,
  type TextChannel,
} from 'discord.js';
import {
  prisma,
  type Ticket,
  type TicketConfig,
  type TicketMessage,
} from '@nexora/database';
import { brandEmbed, chunk, successEmbed, warnEmbed } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { ensureGuildMember } from '../core/guilds';
import { t } from '../core/i18n';
import { safeJsonParse, truncate } from '../core/utils';
import { registerComponentHandler } from '../framework/router';
import { cancelScheduledTasks, scheduleTask } from './task-queue';
import { dispatchAutomationTrigger } from './automations';
import { enqueueWebhookEvent } from './webhooks';
import { incrementAnalytics } from './analytics';
import { logEvent } from './logging';

export interface TicketTypeDefinition {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  categoryId?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export async function getTicketConfig(guildId: string): Promise<TicketConfig> {
  return prisma.ticketConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
}

export function parseTicketTypes(config: TicketConfig): TicketTypeDefinition[] {
  return safeJsonParse<TicketTypeDefinition[]>(config.types) ?? [];
}

/** Post (or replace) the ticket panel message with a select menu of types. */
export async function postTicketPanel(channel: TextChannel): Promise<Message | null> {
  const config = await getTicketConfig(channel.guild.id);
  const types = parseTicketTypes(config);
  if (types.length === 0) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:open')
    .setPlaceholder('Select a ticket type…')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      ...types.slice(0, 25).map((type) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(type.name, 100))
          .setValue(truncate(type.id, 90))
          .setDescription(truncate(type.description || `Open a ${type.name} ticket`, 100))
          .setEmoji(type.emoji ?? '🎫'),
      ),
    );

  const embed = brandEmbed()
    .setTitle('Support tickets')
    .setDescription('Pick a ticket type below and a private channel will be created for you and the staff team.');

  const message = await channel
    .send({
      embeds: [embed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    })
    .catch(() => null);
  if (message) {
    await prisma.ticketConfig.update({
      where: { guildId: channel.guild.id },
      data: { panelChannelId: channel.id, panelMessageId: message.id },
    });
  }
  return message;
}

async function nextTicketNumber(guildId: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const last = await prisma.ticket.findFirst({
      where: { guildId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;
    const existing = await prisma.ticket.findFirst({ where: { guildId, number }, select: { id: true } });
    if (!existing) return number;
  }
  return Date.now(); // effectively unique fallback
}

async function buildTicketChannel(
  guild: Guild,
  creatorId: string,
  number: number,
  typeId: string,
  config: TicketConfig,
): Promise<TextChannel | null> {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return null;
  const type = parseTicketTypes(config).find((entry) => entry.id === typeId);
  const name = truncate(`ticket-${number}-${typeId}`.toLowerCase(), 100);

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    {
      id: creatorId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    ...config.staffRoleIds.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    })),
  ];

  return guild.channels
    .create({
      name,
      type: ChannelType.GuildText,
      ...(type?.categoryId ? { parent: type.categoryId } : {}),
      permissionOverwrites: overwrites,
      reason: `Ticket #${number} opened by ${creatorId}`,
    })
    .catch(() => null);
}

function ticketControlRow(ticketId: string, claimable: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const buttons: ButtonBuilder[] = [];
  if (claimable) {
    buttons.push(
      new ButtonBuilder().setCustomId(`ticket:claim:${ticketId}`).setLabel('Claim').setStyle(ButtonStyle.Primary),
    );
  }
  buttons.push(
    new ButtonBuilder().setCustomId(`ticket:close:${ticketId}`).setLabel('Close').setStyle(ButtonStyle.Danger),
  );
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)];
}

export interface CreateTicketResult {
  ok: boolean;
  message: string;
  ticket?: Ticket;
  channel?: TextChannel;
}

async function createTicketCore(
  guild: Guild,
  creatorId: string,
  typeId: string,
): Promise<CreateTicketResult> {
  const config = await getTicketConfig(guild.id);
  if (!config.enabled) return { ok: false, message: 'Tickets are disabled on this server.' };
  if (config.blacklist.includes(creatorId)) {
    return { ok: false, message: 'You are blacklisted from opening tickets on this server.' };
  }

  const types = parseTicketTypes(config);
  const type = types.find((entry) => entry.id === typeId);
  if (!type) return { ok: false, message: 'That ticket type does not exist.' };

  const openCount = await prisma.ticket.count({
    where: { guildId: guild.id, creatorId, status: { in: ['OPEN', 'CLAIMED', 'REOPENED'] } },
  });
  if (openCount >= 3) return { ok: false, message: 'You already have 3 open tickets. Please close one first.' };

  await ensureGuildMember(guild.id, creatorId);
  const number = await nextTicketNumber(guild.id);
  const channel = await buildTicketChannel(guild, creatorId, number, type.id, config);
  if (!channel) return { ok: false, message: 'I could not create the ticket channel (missing permissions?).' };

  const ticket = await prisma.ticket.create({
    data: {
      guildId: guild.id,
      channelId: channel.id,
      channelName: channel.name,
      number,
      typeId: type.id,
      creatorId: null, // linked below via GuildMember id
      subject: type.name,
      priority: type.priority ?? 'LOW',
      status: 'OPEN',
    },
  });
  await ensureGuildMember(guild.id, creatorId);
  const memberRow = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: creatorId, guildId: guild.id } },
    select: { id: true },
  });
  if (memberRow) {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { creatorId: memberRow.id } });
  }

  const embed = brandEmbed()
    .setTitle(`Ticket #${number} — ${type.name}`)
    .setDescription(`Opened by <@${creatorId}>.\n${type.description ?? ''}`)
    .setFooter({ text: 'Use the buttons below to claim or close this ticket.' })
    .setTimestamp(new Date());
  await channel
    .send({
      content: `<@${creatorId}>${config.staffRoleIds.length > 0 ? config.staffRoleIds.map((id) => `<@&${id}>`).join(' ') : ''}`,
      embeds: [embed],
      components: ticketControlRow(ticket.id, config.claimRequired),
    })
    .catch(() => undefined);

  // Inactivity auto-close.
  await scheduleTask({
    guildId: guild.id,
    kind: 'TICKET_INACTIVITY',
    payload: { ticketId: ticket.id },
    runAt: new Date(Date.now() + config.inactivityHours * 3_600_000),
  }).catch(() => undefined);

  await dispatchAutomationTrigger(guild, 'TICKET_CREATED', {
    userId: creatorId,
    channel,
  }).catch(() => undefined);
  await enqueueWebhookEvent(guild.id, 'ticket.created', { ticketId: ticket.id, number, typeId, userId: creatorId });
  await incrementAnalytics(guild.id, { ticketsOpened: 1 });
  await logEvent(guild, 'tickets', {
    action: `Ticket #${number} (${type.name}) opened`,
    actorId: creatorId,
    eventChannelId: channel.id,
    title: 'Ticket opened',
  }).catch(() => undefined);

  return { ok: true, message: t('ticket.created', { channel: `<#${channel.id}>` }), ticket, channel };
}

/** Panel select-menu entrypoint. */
export async function createTicketFromSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const typeId = interaction.values[0] ?? 'support';
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => undefined);
  const result = await createTicketCore(guild, interaction.user.id, typeId);
  await interaction
    .editReply({ content: result.ok ? result.message : `❌ ${result.message}` })
    .catch(() => undefined);
}

/** Automation CREATE_TICKET entrypoint (no interaction involved). */
export async function createTicketForAutomation(guild: Guild, userId: string, typeId: string): Promise<void> {
  await createTicketCore(guild, userId, typeId);
}

/** Record a message posted inside a ticket channel (transcript persistence). */
export async function recordTicketMessage(message: Message): Promise<void> {
  if (!message.inGuild() || message.system) return;
  const ticket = await prisma.ticket.findUnique({
    where: { channelId: message.channelId },
    select: { id: true },
  });
  if (!ticket) return;
  await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      authorId: message.author.id,
      authorTag: message.author.tag,
      content: truncate(message.content || '(no text)', 1800),
      attachments: JSON.parse(JSON.stringify(
        [...message.attachments.values()].map((a) => ({ url: a.url, name: a.name })),
      )),
    },
  });
}

async function generateTranscript(guild: Guild, ticket: Ticket, messages: TicketMessage[]): Promise<Buffer> {
  const lines = [
    `Nexora ticket transcript — #${ticket.number} (${ticket.subject})`,
    `Guild: ${guild.name} (${guild.id})`,
    `Channel: #${ticket.channelName} (${ticket.channelId})`,
    `Created: ${ticket.createdAt.toISOString()}`,
    `Status: ${ticket.status}`,
    ''.padEnd(60, '='),
    '',
  ];
  for (const entry of messages) {
    lines.push(`[${entry.createdAt.toISOString()}] ${entry.authorTag} (${entry.authorId}):`);
    for (const part of chunk(entry.content, 500)) lines.push(`  ${part}`);
    lines.push('');
  }
  return Buffer.from(lines.join('\n'), 'utf8');
}

export async function closeTicket(
  guild: Guild,
  ticketId: string,
  closedById: string,
  reason: string,
): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { creator: true } });
  if (!ticket || ticket.guildId !== guild.id) return false;
  if (ticket.status === 'CLOSED') return true;

  const config = await getTicketConfig(guild.id);
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'CLOSED', closedAt: new Date(), closedById },
  });
  await cancelScheduledTasks(guild.id, 'TICKET_INACTIVITY', 'ticketId', ticket.id).catch(() => undefined);

  // Transcript
  const messages = await prisma.ticketMessage.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'asc' },
  });
  if (config.transcriptChannelId && messages.length > 0) {
    const transcriptChannel = await getContext().client.channels.fetch(config.transcriptChannelId).catch(() => null);
    if (transcriptChannel?.isSendable()) {
      const buffer = await generateTranscript(guild, ticket, messages);
      await transcriptChannel
        .send({
          embeds: [brandEmbed().setTitle(`Ticket #${ticket.number} closed`).setDescription(`Closed by <@${closedById}> — ${truncate(reason, 500)}`)],
          files: [new AttachmentBuilder(buffer, { name: `transcript-${ticket.number}.txt` })],
        })
        .catch(() => undefined);
    }
  }

  // Rating prompt inside the ticket channel.
  const channel = await getContext().client.channels.fetch(ticket.channelId).catch(() => null);
  if (channel?.isSendable()) {
    const ratingRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...[1, 2, 3, 4, 5].map((stars) =>
        new ButtonBuilder()
          .setCustomId(`ticket:rate:${ticket.id}:${stars}`)
          .setLabel(String(stars))
          .setEmoji('⭐')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
    const reopenRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket:reopen:${ticket.id}`).setLabel('Reopen').setStyle(ButtonStyle.Primary),
    );
    await channel
      .send({
        embeds: [warnEmbed('This ticket was closed. Rate the support you received below, or reopen the ticket.')],
        components: [ratingRow, reopenRow],
      })
      .catch(() => undefined);
  }

  await dispatchAutomationTrigger(guild, 'TICKET_CLOSED', {
    userId: ticket.creator?.userId,
    channel: channel && channel.isTextBased() ? channel : null,
  }).catch(() => undefined);
  await enqueueWebhookEvent(guild.id, 'ticket.closed', { ticketId: ticket.id, number: ticket.number, closedById });
  await logEvent(guild, 'tickets', {
    action: `Ticket #${ticket.number} closed (${truncate(reason, 200)})`,
    actorId: closedById,
    eventChannelId: ticket.channelId,
    title: 'Ticket closed',
  }).catch(() => undefined);
  return true;
}

export async function claimTicket(guild: Guild, ticketId: string, claimedById: string): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.guildId !== guild.id) return false;
  if (ticket.status === 'CLOSED') return false;
  const memberRow = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: claimedById, guildId: guild.id } },
    select: { id: true },
  });
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'CLAIMED', claimedById: memberRow?.id ?? null },
  });
  const channel = await getContext().client.channels.fetch(ticket.channelId).catch(() => null);
  if (channel?.isSendable()) {
    await channel.send({ embeds: [successEmbed(`Ticket claimed by <@${claimedById}>.`)] }).catch(() => undefined);
  }
  return true;
}

export async function reopenTicket(guild: Guild, ticketId: string, userId: string): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.guildId !== guild.id) return false;
  if (ticket.status !== 'CLOSED') return true;
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'REOPENED', reopenCount: { increment: 1 }, closedAt: null, closedById: null },
  });
  const config = await getTicketConfig(guild.id);
  await scheduleTask({
    guildId: guild.id,
    kind: 'TICKET_INACTIVITY',
    payload: { ticketId: ticket.id },
    runAt: new Date(Date.now() + config.inactivityHours * 3_600_000),
  }).catch(() => undefined);
  const channel = await getContext().client.channels.fetch(ticket.channelId).catch(() => null);
  if (channel?.isSendable()) {
    await channel.send({ embeds: [successEmbed(`Ticket reopened by <@${userId}>.`)] }).catch(() => undefined);
  }
  return true;
}

/** Scheduler callback for TICKET_INACTIVITY tasks. */
export async function handleTicketInactivity(guildId: string, ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status === 'CLOSED') return;
  const guild = await getContext().client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const lastMessage = await prisma.ticketMessage.findFirst({
    where: { ticketId },
    orderBy: { createdAt: 'desc' },
  });
  const lastActivity = lastMessage?.createdAt ?? ticket.createdAt;
  const config = await getTicketConfig(guildId);
  const inactiveAfter = config.inactivityHours * 3_600_000;

  if (Date.now() - lastActivity.getTime() >= inactiveAfter) {
    await closeTicket(guild, ticketId, getContext().client.user?.id ?? '0', 'Closed automatically due to inactivity');
    return;
  }
  // Not inactive yet — re-arm from the last activity.
  await scheduleTask({
    guildId,
    kind: 'TICKET_INACTIVITY',
    payload: { ticketId },
    runAt: new Date(lastActivity.getTime() + inactiveAfter),
  }).catch(() => undefined);
}

/** Called from channelDelete so deleted ticket channels don't stay "open". */
export async function markTicketChannelDeleted(channelId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { channelId } });
  if (!ticket || ticket.status === 'CLOSED') return;
  await prisma.ticket
    .update({
      where: { id: ticket.id },
      data: { status: 'CLOSED', closedAt: new Date(), closedById: getContext().client.user?.id },
    })
    .catch(() => undefined);
}

function isTicketStaff(interaction: ButtonInteraction | StringSelectMenuInteraction, staffRoleIds: string[]): boolean {
  const member = interaction.member;
  if (!(member instanceof GuildMember)) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

// ---------------------------------------------------------------------------
// Component handlers
// ---------------------------------------------------------------------------

registerComponentHandler('ticket', async (interaction, parts) => {
  const action = parts[1];
  const guild = interaction.guild;
  if (!guild) return;

  if (action === 'open' && interaction.isStringSelectMenu()) {
    await createTicketFromSelect(interaction);
    return;
  }
  if (!interaction.isButton()) return;

  const config = await getTicketConfig(guild.id).catch(() => null);
  if (!config) return;

  if (action === 'claim' && parts[2]) {
    if (!isTicketStaff(interaction, config.staffRoleIds)) {
      await interaction.reply({ embeds: [warnEmbed('Only staff can claim tickets.')], flags: MessageFlags.Ephemeral }).catch(() => undefined);
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => undefined);
    const claimed = await claimTicket(guild, parts[2], interaction.user.id);
    await interaction.editReply({ content: claimed ? '✅ Ticket claimed.' : '❌ Could not claim this ticket.' }).catch(() => undefined);
    return;
  }

  if (action === 'close' && parts[2]) {
    const ticket = await prisma.ticket.findUnique({ where: { id: parts[2] }, include: { creator: true } });
    let isCreator = false;
    if (ticket?.creator && interaction.member instanceof GuildMember) {
      isCreator = ticket.creator.userId === interaction.user.id;
    }
    if (!isTicketStaff(interaction, config.staffRoleIds) && !isCreator) {
      await interaction.reply({ embeds: [warnEmbed('Only staff or the ticket creator can close this ticket.')], flags: MessageFlags.Ephemeral }).catch(() => undefined);
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => undefined);
    const closed = await closeTicket(guild, parts[2], interaction.user.id, 'Closed via button');
    await interaction.editReply({ content: closed ? '✅ Ticket closed.' : '❌ Could not close this ticket.' }).catch(() => undefined);
    return;
  }

  if (action === 'reopen' && parts[2]) {
    const ticket = await prisma.ticket.findUnique({ where: { id: parts[2] } });
    let allowed = isTicketStaff(interaction, config.staffRoleIds);
    if (!allowed && ticket && interaction.member instanceof GuildMember) {
      const creatorRow = await prisma.guildMember.findUnique({
        where: { userId_guildId: { userId: interaction.user.id, guildId: guild.id } },
        select: { id: true },
      });
      allowed = creatorRow !== null && creatorRow.id === ticket.creatorId;
    }
    if (!allowed) {
      await interaction.reply({ embeds: [warnEmbed('Only staff or the ticket creator can reopen this ticket.')], flags: MessageFlags.Ephemeral }).catch(() => undefined);
      return;
    }
    await reopenTicket(guild, parts[2], interaction.user.id);
    await interaction.reply({ embeds: [successEmbed('Ticket reopened.')], flags: MessageFlags.Ephemeral }).catch(() => undefined);
    return;
  }

  if (action === 'rate' && parts[2] && parts[3]) {
    const stars = Math.min(Math.max(Number.parseInt(parts[3], 10) || 0, 1), 5);
    const ticket = await prisma.ticket.findUnique({ where: { id: parts[2] } });
    if (!ticket || ticket.status !== 'CLOSED') return;
    await prisma.user.upsert({ where: { id: interaction.user.id }, create: { id: interaction.user.id }, update: {} });
    await prisma.ticketRating
      .upsert({
        where: { ticketId_userId: { ticketId: ticket.id, userId: interaction.user.id } },
        create: { ticketId: ticket.id, userId: interaction.user.id, stars },
        update: { stars },
      })
      .catch((err) => getContext().log.warn({ err: serializeError(err) }, 'Ticket rating failed'));
    const average = await prisma.ticketRating.aggregate({ where: { ticketId: ticket.id }, _avg: { stars: true } });
    if (average._avg.stars !== null) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { rating: Math.round(average._avg.stars) } }).catch(() => undefined);
    }
    await interaction.reply({ embeds: [successEmbed(`Thanks for rating this ticket ${'⭐'.repeat(stars)}!`)], flags: MessageFlags.Ephemeral }).catch(() => undefined);
  }
});

export async function getOpenTicketCount(guildId: string): Promise<number> {
  return prisma.ticket.count({
    where: { guildId, status: { in: ['OPEN', 'CLAIMED', 'REOPENED'] } },
  });
}
