import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type ModalSubmitInteraction,
} from 'discord.js';
import { prisma, type VerificationConfig } from '@nexora/database';
import { brandEmbed, snowflakeToDate, successEmbed } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { t } from '../core/i18n';
import { randomInt, randomToken, sha256, truncate } from '../core/utils';
import { registerComponentHandler } from '../framework/router';
import { scheduleTask } from './task-queue';
import { logEvent } from './logging';
import { enqueueWebhookEvent } from './webhooks';

const VERIFICATION_EMOJI = '✅';
const BUTTON_CUSTOM_ID = 'verification:button';
const MODAL_CUSTOM_ID = 'verification:modal';

export async function getVerificationConfig(guildId: string): Promise<VerificationConfig> {
  return prisma.verificationConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
}

interface StoredCode {
  /** `${salt}:${sha256(salt + code)}` */
  codeHash: string;
}

function hashCode(code: string): string {
  const salt = randomToken(8);
  return `${salt}:${sha256(salt + code)}`;
}

function verifyCode(stored: string | null, input: string): boolean {
  if (!stored) return false;
  const separatorIndex = stored.indexOf(':');
  if (separatorIndex <= 0) return false;
  const salt = stored.slice(0, separatorIndex);
  const expected = `${salt}:${sha256(salt + input)}`;
  return expected === stored;
}

function generateCode(): string {
  return String(randomInt(100_000, 999_999));
}

/** Begin (or refresh) verification for a member that just joined. */
export async function startVerification(member: GuildMember): Promise<void> {
  const guild = member.guild;
  const config = await getVerificationConfig(guild.id);
  if (!config.enabled) return;
  const { log } = getContext();

  // Already verified?
  if (config.roleId && member.roles.cache.has(config.roleId)) return;
  const minAgeHours = config.minAccountAgeHours;
  if (minAgeHours > 0 && (Date.now() - snowflakeToDate(member.id).getTime()) / 3_600_000 < minAgeHours) {
    return; // too new — wait for a future rejoin; the config keeps them gated via unverified role
  }

  const expiresAt = new Date(Date.now() + config.timeoutMinutes * 60_000);
  const captcha = config.mode === 'CAPTCHA';
  const code = generateCode();
  const stored: StoredCode = { codeHash: hashCode(code) };

  await prisma.verificationAttempt.upsert({
    where: { guildId_userId: { guildId: guild.id, userId: member.id } },
    create: {
      guildId: guild.id,
      userId: member.id,
      codeHash: captcha ? stored.codeHash : null,
      attempts: 0,
      expiresAt,
    },
    update: {
      codeHash: captcha ? stored.codeHash : null,
      attempts: 0,
      verifiedAt: null,
      expiresAt,
    },
  });

  // Unverified role keeps them gated while the attempt is pending.
  if (config.unverifiedRoleId) {
    const role = guild.roles.cache.get(config.unverifiedRoleId);
    const me = guild.members.me;
    if (role && me?.permissions.has(PermissionFlagsBits.ManageRoles) && role.position < me.roles.highest.position) {
      await member.roles.add(role, 'Verification pending').catch(() => undefined);
    }
  }

  // Kick-on-timeout task; the scheduler re-checks verifiedAt before acting.
  await scheduleTask({
    guildId: guild.id,
    kind: 'VERIFICATION_TIMEOUT',
    payload: { userId: member.id },
    runAt: expiresAt,
  }).catch((err) => log.warn({ err: serializeError(err) }, 'Failed to schedule verification timeout'));

  const embed = brandEmbed()
    .setTitle(t('verify.prompt', { server: guild.name }))
    .setDescription(
      captcha
        ? 'Your verification code is below. Click **Verify** in this DM and enter the code to complete verification.'
        : 'Click the **Verify** button below to complete verification.',
    )
    .setFooter({ text: `Expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(BUTTON_CUSTOM_ID).setLabel('Verify').setStyle(ButtonStyle.Success),
  );

  const dm = await member
    .send({
      embeds: captcha ? [embed, new EmbedBuilder().setTitle(code).setColor(0x5865f2)] : [embed],
      components: [row],
    })
    .catch(() => null);

  if (!dm) {
    // DMs closed — fall back to the channel panel if configured.
    await postVerificationPanel(guild).catch(() => undefined);
  }

  if (config.mode === 'REACTION') {
    await postVerificationPanel(guild).catch(() => undefined);
  }

  await logEvent(guild, 'verification', {
    action: `Verification started (${config.mode})`,
    targetId: member.id,
    eventChannelId: config.channelId,
    title: 'Verification started',
  }).catch(() => undefined);
}

/** Ensure a reaction-mode panel exists in the configured channel. */
export async function postVerificationPanel(guild: Guild): Promise<void> {
  const config = await getVerificationConfig(guild.id);
  if (!config.enabled || !config.channelId) return;
  const channel = await getContext().client.channels.fetch(config.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  if (config.messageId) {
    const existing = await channel.messages.fetch(config.messageId).catch(() => null);
    if (existing) return;
  }

  const message = await channel
    .send({
      embeds: [
        brandEmbed()
          .setTitle('Verify yourself')
          .setDescription(
            `React with ${VERIFICATION_EMOJI} to this message to verify and unlock **${guild.name}**.`,
          ),
      ],
    })
    .catch(() => null);
  if (!message) return;
  await message.react(VERIFICATION_EMOJI).catch(() => undefined);
  await prisma.verificationConfig.update({ where: { guildId: guild.id }, data: { messageId: message.id } });
}

async function completeVerification(guild: Guild, userId: string): Promise<boolean> {
  const config = await getVerificationConfig(guild.id);
  const attempt = await prisma.verificationAttempt.findUnique({
    where: { guildId_userId: { guildId: guild.id, userId } },
  });
  if (!attempt || attempt.verifiedAt) return false;
  if (attempt.expiresAt.getTime() < Date.now()) return false;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;

  if (config.roleId) {
    const role = guild.roles.cache.get(config.roleId);
    const me = guild.members.me;
    if (role && me?.permissions.has(PermissionFlagsBits.ManageRoles) && role.position < me.roles.highest.position) {
      await member.roles.add(role, 'Verified').catch(() => undefined);
    }
  }
  if (config.unverifiedRoleId) {
    await member.roles.remove(config.unverifiedRoleId, 'Verified').catch(() => undefined);
  }

  await prisma.verificationAttempt.update({
    where: { guildId_userId: { guildId: guild.id, userId } },
    data: { verifiedAt: new Date(), codeHash: null },
  });

  await member
    .send({ embeds: [successEmbed(t('verify.success', { server: guild.name }))] })
    .catch(() => undefined);

  await logEvent(guild, 'verification', {
    action: 'Verification completed',
    targetId: userId,
    title: 'Verification completed',
  }).catch(() => undefined);
  await enqueueWebhookEvent(guild.id, 'verification.completed', { userId });
  return true;
}

/** REACTION mode entrypoint from messageReactionAdd. */
export async function handleVerificationReaction(guild: Guild, messageId: string, emojiName: string, userId: string): Promise<void> {
  const config = await getVerificationConfig(guild.id).catch(() => null);
  if (!config?.enabled || config.mode !== 'REACTION' || !config.messageId || messageId !== config.messageId) return;
  if (emojiName !== VERIFICATION_EMOJI) return;
  const me = guild.members.me;
  if (userId === me?.id) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  if (member.user.bot) return;
  await completeVerification(guild, userId).catch((err) =>
    getContext().log.warn({ err: serializeError(err) }, 'Reaction verification failed'),
  );
}

/** Scheduled VERIFICATION_TIMEOUT handler: clean up / kick. */
export async function handleVerificationTimeout(guildId: string, userId: string): Promise<void> {
  const config = await getVerificationConfig(guildId).catch(() => null);
  if (!config?.enabled) return;
  const attempt = await prisma.verificationAttempt.findUnique({
    where: { guildId_userId: { guildId: guildId, userId } },
  });
  if (!attempt) return;
  if (attempt.verifiedAt) {
    await prisma.verificationAttempt.delete({ where: { id: attempt.id } }).catch(() => undefined);
    return;
  }
  if (attempt.expiresAt.getTime() > Date.now()) return; // refreshed since

  await prisma.verificationAttempt.delete({ where: { id: attempt.id } }).catch(() => undefined);
  const guild = await getContext().client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  if (config.kickOnTimeout) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      await member.kick('Verification timed out').catch(() => undefined);
      await logEvent(guild, 'verification', {
        action: 'Kicked: verification timed out',
        targetId: userId,
        title: 'Verification timeout',
      }).catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Component handlers (button + modal)
// ---------------------------------------------------------------------------

registerComponentHandler('verification', async (interaction, parts) => {
  if (parts[1] === 'button' && interaction.isButton()) {
    await handleVerifyButton(interaction);
    return;
  }
  if (parts[1] === 'modal' && interaction.isModalSubmit()) {
    await handleVerifyModal(interaction);
  }
});

async function handleVerifyButton(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const config = await getVerificationConfig(guild.id).catch(() => null);
  if (!config?.enabled) {
    await interaction
      .reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('Verification is not enabled on this server.')], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }

  if (config.mode === 'CAPTCHA') {
    const modal = new ModalBuilder()
      .setCustomId(MODAL_CUSTOM_ID)
      .setTitle('Enter verification code')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('code')
            .setLabel('Verification code (from your DM)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(4)
            .setMaxLength(12)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal).catch(() => undefined);
    return;
  }

  const verified = await completeVerification(guild, interaction.user.id);
  await interaction
    .reply({
      embeds: [
        verified
          ? successEmbed(t('verify.success', { server: guild.name }))
          : new EmbedBuilder().setColor(0xed4245).setDescription('No pending verification found or it has expired. Rejoin the server to restart verification.'),
      ],
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => undefined);
}

async function handleVerifyModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const input = interaction.fields.getTextInputValue('code').trim();

  const attempt = await prisma.verificationAttempt.findUnique({
    where: { guildId_userId: { guildId: guild.id, userId: interaction.user.id } },
  });
  if (!attempt || attempt.verifiedAt || attempt.expiresAt.getTime() < Date.now()) {
    await interaction
      .reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('Your verification session has expired. Rejoin the server to restart.')], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }

  const config = await getVerificationConfig(guild.id);
  if (verifyCode(attempt.codeHash, input)) {
    const verified = await completeVerification(guild, interaction.user.id);
    await interaction
      .reply({
        embeds: [
          verified
            ? successEmbed(t('verify.success', { server: guild.name }))
            : new EmbedBuilder().setColor(0xed4245).setDescription('Verification could not be completed. Please contact a moderator.'),
        ],
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => undefined);
    return;
  }

  const attempts = attempt.attempts + 1;
  await prisma.verificationAttempt.update({
    where: { id: attempt.id },
    data: { attempts },
  });

  const exhausted = attempts >= config.attemptsAllowed;
  if (exhausted) {
    await prisma.verificationAttempt.delete({ where: { id: attempt.id } }).catch(() => undefined);
    if (config.kickOnTimeout) {
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (member) await member.kick('Verification: too many failed attempts').catch(() => undefined);
    }
  }

  await interaction
    .reply({
      embeds: [
        new EmbedBuilder().setColor(0xed4245).setDescription(
          exhausted
            ? 'Too many failed attempts. Your verification session was closed.'
            : `Incorrect code. ${Math.max(config.attemptsAllowed - attempts, 0)} attempts remaining.`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => undefined);
}
