import type { VoiceState } from 'discord.js';
import { prisma } from '@nexora/database';
import { getContext } from '../core/context';
import { logEvent } from '../services/logging';
import { incrementAnalytics } from '../services/analytics';
import type { BotEvent } from '../framework/types';

const VOICE_TRACK_TTL_SECONDS = 43_200; // 12h safety net for stuck sessions
const voiceKey = (guildId: string, userId: string): string => `voice:${guildId}:${userId}`;

/** Settle a voice session: convert tracked seconds into voiceMinutes. */
async function settleVoiceSession(guildId: string, userId: string): Promise<void> {
  const { cache } = getContext();
  const startedAtRaw = await cache.get(voiceKey(guildId, userId));
  if (!startedAtRaw) return;
  await cache.del(voiceKey(guildId, userId));

  const startedAt = Date.parse(startedAtRaw);
  if (Number.isNaN(startedAt)) return;
  const minutes = Math.floor((Date.now() - startedAt) / 60_000);
  if (minutes < 1) return;

  await prisma.guildMember
    .updateMany({
      where: { guildId, userId, leftAt: null },
      data: { voiceMinutes: { increment: minutes } },
    })
    .catch(() => undefined);
  await incrementAnalytics(guildId, { voiceMinutes: minutes }).catch(() => undefined);
}

export const voiceStateUpdateEvent: BotEvent<'voiceStateUpdate'> = {
  name: 'voiceStateUpdate',
  async execute(oldState: VoiceState, newState: VoiceState) {
    const guild = newState.guild;
    const userId = newState.id;
    const { cache } = getContext();

    const oldChannel = oldState.channelId ?? null;
    const newChannel = newState.channelId ?? null;

    if (!oldChannel && newChannel) {
      // Joined voice.
      await cache.set(voiceKey(guild.id, userId), new Date().toISOString(), VOICE_TRACK_TTL_SECONDS);
      await logEvent(guild, 'voice', {
        action: `Joined <#${newChannel}>`,
        targetId: userId,
        eventChannelId: newChannel,
        title: 'Voice: joined',
      }).catch(() => undefined);
      return;
    }

    if (oldChannel && !newChannel) {
      // Left voice.
      await settleVoiceSession(guild.id, userId);
      await logEvent(guild, 'voice', {
        action: `Left <#${oldChannel}>`,
        targetId: userId,
        eventChannelId: oldChannel,
        title: 'Voice: left',
      }).catch(() => undefined);
      return;
    }

    if (oldChannel && newChannel && oldChannel !== newChannel) {
      // Moved between channels.
      await settleVoiceSession(guild.id, userId);
      await cache.set(voiceKey(guild.id, userId), new Date().toISOString(), VOICE_TRACK_TTL_SECONDS);
      await logEvent(guild, 'voice', {
        action: `Moved <#${oldChannel}> → <#${newChannel}>`,
        targetId: userId,
        eventChannelId: newChannel,
        title: 'Voice: moved',
      }).catch(() => undefined);
    }
  },
};
