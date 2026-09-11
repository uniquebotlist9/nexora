import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type Guild,
} from 'discord.js';
import { prisma, type Giveaway, type GiveawayEntry } from '@nexora/database';
import type { GiveawayStatus } from '@nexora/types';
import { giveawayCreateInputSchema } from '@nexora/validation';
import { brandEmbed, snowflakeToDate, successEmbed, warnEmbed } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { getGuildLimits } from '../core/guilds';
import { randomInt, safeJsonParse } from '../core/utils';
import { registerComponentHandler } from '../framework/router';
import { scheduleTask } from './task-queue';
import { dispatchAutomationTrigger } from './automations';
import { enqueueWebhookEvent } from './webhooks';
import { incrementAnalytics } from './analytics';
import { logEvent } from './logging';

export interface CreateGiveawayInput {
  guild: Guild;
  channelId: string;
  prize: string;
  description?: string;
  winnerCount: number;
  durationMinutes: number;
  requiredRoleId?: string;
  minAccountAgeDays?: number;
  minMembershipDays?: number;
  minMessages?: number;
  bonusRoles?: { roleId: string; extraEntries: number }[];
  createdByUserId: string;
}

export type GiveawayResult = { ok: true; giveaway: Giveaway; message?: string } | { ok: false; message: string };

function giveawayEmbed(giveaway: Giveaway, ended = false): ReturnType<typeof brandEmbed> {
  const embed = brandEmbed()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setDescription(giveaway.description ?? 'React to enter the giveaway!')
    .addFields(
      { name: 'Winners', value: String(giveaway.winnerCount), inline: true },
      { name: ended ? 'Ended' : 'Ends', value: `<t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:R>`, inline: true },
    );
  if (giveaway.requiredRoleId) embed.addFields({ name: 'Required role', value: `<@&${giveaway.requiredRoleId}>`, inline: true });
  if (giveaway.minMessages) embed.addFields({ name: 'Min messages', value: String(giveaway.minMessages), inline: true });
  if (giveaway.minAccountAgeDays) embed.addFields({ name: 'Min account age', value: `${giveaway.minAccountAgeDays}d`, inline: true });
  if (giveaway.minMembershipDays) embed.addFields({ name: 'Min membership', value: `${giveaway.minMembershipDays}d`, inline: true });
  embed.setFooter({ text: ended ? 'This giveaway has ended.' : 'Click Join to enter!' });
  return embed;
}

export async function createGiveaway(input: CreateGiveawayInput): Promise<GiveawayResult> {
  const parsed = giveawayCreateInputSchema.safeParse({
    channelId: input.channelId,
    prize: input.prize,
    description: input.description,
    winnerCount: input.winnerCount,
    durationMinutes: input.durationMinutes,
    requiredRoleId: input.requiredRoleId,
    minAccountAgeDays: input.minAccountAgeDays,
    minMembershipDays: input.minMembershipDays,
    minMessages: input.minMessages,
    bonusRoles: input.bonusRoles,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid giveaway configuration.' };
  }
  const data = parsed.data;

  // Plan limit on concurrent giveaways.
  const limits = await getGuildLimits(input.guild.id);
  const running = await prisma.giveaway.count({
    where: { guildId: input.guild.id, status: 'RUNNING' },
  });
  if (running >= limits.giveaways) {
    return { ok: false, message: `This server has reached its plan limit of ${limits.giveaways} concurrent giveaways.` };
  }

  const channel = await getContext().client.channels.fetch(data.channelId).catch(() => null);
  if (!channel?.isSendable()) return { ok: false, message: 'I cannot post giveaways in that channel.' };

  const endsAt = new Date(Date.now() + data.durationMinutes * 60_000);
  const giveaway = await prisma.giveaway.create({
    data: {
      guildId: input.guild.id,
      channelId: data.channelId,
      prize: data.prize,
      description: data.description ?? null,
      winnerCount: data.winnerCount,
      requiredRoleId: data.requiredRoleId ?? null,
      minAccountAgeDays: data.minAccountAgeDays ?? null,
      minMembershipDays: data.minMembershipDays ?? null,
      minMessages: data.minMessages ?? null,
      bonusRoles: JSON.parse(JSON.stringify(data.bonusRoles ?? [])),
      endsAt,
    },
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`giveaway:enter:${giveaway.id}`).setLabel('Join').setStyle(ButtonStyle.Success).setEmoji('🎉'),
  );
  const message = await channel
    .send({ embeds: [giveawayEmbed(giveaway)], components: [row] })
    .catch(() => null);
  if (!message) {
    await prisma.giveaway.delete({ where: { id: giveaway.id } });
    return { ok: false, message: 'I could not post the giveaway message.' };
  }

  await prisma.giveaway.update({ where: { id: giveaway.id }, data: { messageId: message.id } });
  await scheduleTask({
    guildId: input.guild.id,
    kind: 'GIVEAWAY_END',
    payload: { giveawayId: giveaway.id },
    runAt: endsAt,
  });
  await enqueueWebhookEvent(input.guild.id, 'giveaway.started', {
    giveawayId: giveaway.id, prize: giveaway.prize, winnerCount: giveaway.winnerCount, endsAt: endsAt.toISOString(),
  });
  await incrementAnalytics(input.guild.id, { giveaways: 1 });
  await logEvent(input.guild, 'giveaways', {
    action: `Giveaway started: ${giveaway.prize} (${giveaway.winnerCount} winners)`,
    actorId: input.createdByUserId,
    eventChannelId: giveaway.channelId,
    title: 'Giveaway started',
  }).catch(() => undefined);

  return { ok: true, giveaway };
}

interface BonusRole {
  roleId: string;
  extraEntries: number;
}

/** Filter entries by requirements and compute weighted entry counts. */
async function eligibleEntries(
  guild: Guild,
  giveaway: Giveaway,
  entries: GiveawayEntry[],
  excludeUserIds: string[] = [],
): Promise<{ userId: string; weight: number }[]> {
  const bonusRoles = safeJsonParse<BonusRole[]>(giveaway.bonusRoles) ?? [];
  const result: { userId: string; weight: number }[] = [];

  for (const entry of entries) {
    if (excludeUserIds.includes(entry.userId)) continue;
    const member = await guild.members.fetch(entry.userId).catch(() => null);
    if (!member) continue; // left the server

    if (giveaway.requiredRoleId && !member.roles.cache.has(giveaway.requiredRoleId)) continue;

    if (giveaway.minAccountAgeDays !== null) {
      const ageDays = (Date.now() - snowflakeToDate(member.id).getTime()) / 86_400_000;
      if (ageDays < giveaway.minAccountAgeDays) continue;
    }
    if (giveaway.minMembershipDays !== null) {
      const joined = member.joinedAt;
      if (!joined || (Date.now() - joined.getTime()) / 86_400_000 < giveaway.minMembershipDays) continue;
    }
    if (giveaway.minMessages !== null) {
      const memberRow = await prisma.guildMember.findUnique({
        where: { userId_guildId: { userId: entry.userId, guildId: guild.id } },
        select: { messageCount: true },
      });
      if (!memberRow || memberRow.messageCount < giveaway.minMessages) continue;
    }

    const extra = bonusRoles
      .filter((bonus) => member.roles.cache.has(bonus.roleId))
      .reduce((sum, bonus) => sum + Math.max(bonus.extraEntries, 0), 0);
    result.push({ userId: entry.userId, weight: entry.entryCount + extra });
  }
  return result;
}

/** Weighted random selection without replacement. */
function pickWeighted(pool: { userId: string; weight: number }[], count: number): string[] {
  const candidates = [...pool];
  const winners: string[] = [];
  while (winners.length < count && candidates.length > 0) {
    const totalWeight = candidates.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = randomInt(1, Math.max(totalWeight, 1));
    let index = 0;
    for (; index < candidates.length; index += 1) {
      roll -= candidates[index].weight;
      if (roll <= 0) break;
    }
    if (index >= candidates.length) index = candidates.length - 1;
    const [picked] = candidates.splice(index, 1);
    if (picked) winners.push(picked.userId);
  }
  return winners;
}

async function announceWinners(guild: Guild, giveaway: Giveaway, winnerIds: string[], footer: string): Promise<void> {
  const channel = await getContext().client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel?.isSendable()) return;
  const mentionList = winnerIds.map((id) => `<@${id}>`).join(' ');
  await channel
    .send({
      content:
        winnerIds.length > 0
          ? `🎉 ${mentionList} — congratulations, you won **${giveaway.prize}**!`
          : `🎉 The giveaway **${giveaway.prize}** ended with no eligible winners.`,
      embeds: [brandEmbed().setTitle(`Giveaway ended: ${giveaway.prize}`).setFooter({ text: footer })],
    })
    .catch(() => undefined);
}

async function editGiveawayMessage(guild: Guild, giveaway: Giveaway, winnerIds: string[]): Promise<void> {
  if (!giveaway.messageId) return;
  const channel = await getContext().client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!message) return;
  const embed = giveawayEmbed(giveaway, true);
  if (winnerIds.length > 0) {
    embed.addFields({ name: 'Winners', value: winnerIds.map((id) => `<@${id}>`).join(' ').slice(0, 1024) || '—' });
  }
  await message.edit({ embeds: [embed], components: [] }).catch(() => undefined);
}

export async function endGiveaway(giveawayId: string): Promise<void> {
  const giveaway = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
  if (!giveaway || giveaway.status !== 'RUNNING') return;

  const guild = await getContext().client.guilds.fetch(giveaway.guildId).catch(() => null);
  if (!guild) {
    await prisma.giveaway.update({ where: { id: giveaway.id }, data: { status: 'ENDED', endedAt: new Date() } });
    return;
  }

  const entries = await prisma.giveawayEntry.findMany({ where: { giveawayId: giveaway.id } });
  const eligible = await eligibleEntries(guild, giveaway, entries);
  const winnerIds = pickWeighted(eligible, giveaway.winnerCount);

  await prisma.giveaway.update({
    where: { id: giveaway.id },
    data: { status: 'ENDED', endedAt: new Date(), winnerIds },
  });
  await editGiveawayMessage(guild, giveaway, winnerIds);
  await announceWinners(guild, giveaway, winnerIds, `Giveaway ID: ${giveaway.id}`);

  await dispatchAutomationTrigger(guild, 'GIVEAWAY_ENDED', { userId: winnerIds[0] }).catch(() => undefined);
  await enqueueWebhookEvent(giveaway.guildId, 'giveaway.ended', {
    giveawayId: giveaway.id, prize: giveaway.prize, winnerIds,
  });
  await logEvent(guild, 'giveaways', {
    action: `Giveaway ended: ${giveaway.prize} (${winnerIds.length}/${giveaway.winnerCount} winners)`,
    title: 'Giveaway ended',
  }).catch(() => undefined);
}

export async function endGiveawayEarly(messageId: string): Promise<GiveawayResult> {
  const found = await prisma.giveaway.findFirst({ where: { messageId, status: 'RUNNING' } });
  if (!found) return { ok: false, message: 'No running giveaway found for that message ID.' };
  await prisma.giveaway.update({ where: { id: found.id }, data: { endsAt: new Date() } });
  await endGiveaway(found.id);
  return { ok: true, giveaway: { ...found, endsAt: new Date() } };
}

export async function rerollGiveaway(messageId: string, count: number): Promise<GiveawayResult> {
  const giveaway = await prisma.giveaway.findFirst({ where: { messageId } });
  if (!giveaway) return { ok: false, message: 'No giveaway found for that message ID.' };
  if (giveaway.status !== 'ENDED') return { ok: false, message: 'That giveaway has not ended yet.' };

  const guild = await getContext().client.guilds.fetch(giveaway.guildId).catch(() => null);
  if (!guild) return { ok: false, message: 'I cannot access that server anymore.' };

  const entries = await prisma.giveawayEntry.findMany({ where: { giveawayId: giveaway.id } });
  const eligible = await eligibleEntries(guild, giveaway, entries, giveaway.winnerIds);
  const winners = pickWeighted(eligible, Math.max(1, count));
  if (winners.length === 0) return { ok: false, message: 'No eligible entries to reroll from.' };

  const updated = await prisma.giveaway.update({
    where: { id: giveaway.id },
    data: { winnerIds: [...giveaway.winnerIds, ...winners], rerollCount: { increment: 1 } },
  });
  await announceWinners(guild, giveaway, winners, `Reroll #${updated.rerollCount} — original winners excluded`);
  return { ok: true, giveaway: updated };
}

export async function listRunningGiveaways(guildId: string): Promise<Giveaway[]> {
  return prisma.giveaway.findMany({
    where: { guildId, status: 'RUNNING' },
    orderBy: { endsAt: 'asc' },
    take: 10,
  });
}

// ---------------------------------------------------------------------------
// Component handler — join / leave toggle
// ---------------------------------------------------------------------------

registerComponentHandler('giveaway', async (interaction, parts) => {
  if (!interaction.isButton() || parts[1] !== 'enter' || !parts[2]) return;
  const guild = interaction.guild;
  if (!guild) return;

  const giveawayId = parts[2];
  const giveaway = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
  if (!giveaway || giveaway.status !== 'RUNNING') {
    await interaction
      .reply({ embeds: [warnEmbed('This giveaway has already ended.')], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }

  const existing = await prisma.giveawayEntry.findUnique({
    where: { giveawayId_userId: { giveawayId, userId: interaction.user.id } },
  });

  if (existing) {
    await prisma.giveawayEntry.delete({ where: { id: existing.id } });
    await interaction
      .reply({ embeds: [warnEmbed(`You left the giveaway for **${giveaway.prize}**.`)], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }

  await prisma.giveawayEntry.create({
    data: { giveawayId, userId: interaction.user.id, entryCount: 1 },
  });
  await interaction
    .reply({ embeds: [successEmbed(`You entered the giveaway for **${giveaway.prize}**! Good luck.`)], flags: MessageFlags.Ephemeral })
    .catch((err) => getContext().log.warn({ err: serializeError(err) }, 'Giveaway join failed'));
});
