import type { BotEvent } from '../framework/types';
import { readyEvent } from './ready';
import { guildCreateEvent, guildDeleteEvent } from './guild-create';
import { messageCreateEvent } from './message-create';
import { messageDeleteEvent, messageUpdateEvent } from './message-delete';
import { guildMemberAddEvent, guildMemberRemoveEvent } from './guild-member-add';
import { guildMemberUpdateEvent } from './guild-member-update';
import { guildBanAddEvent, guildBanRemoveEvent } from './guild-bans';
import {
  channelCreateEvent,
  channelDeleteEvent,
  channelUpdateEvent,
  guildUpdateEvent,
  roleCreateEvent,
  roleDeleteEvent,
  roleUpdateEvent,
} from './channels';
import { messageReactionAddEvent, messageReactionRemoveEvent } from './reactions';
import { voiceStateUpdateEvent } from './voice';
import { interactionCreateEvent } from './interaction-create';
import {
  errorEvent,
  shardDisconnectEvent,
  shardReconnectingEvent,
  shardResumeEvent,
  warnEvent,
} from './client-errors';

/** Every gateway listener mounted by the bot. */
export const events: readonly BotEvent[] = [
  readyEvent,
  guildCreateEvent,
  guildDeleteEvent,
  messageCreateEvent,
  messageDeleteEvent,
  messageUpdateEvent,
  guildMemberAddEvent,
  guildMemberRemoveEvent,
  guildMemberUpdateEvent,
  guildBanAddEvent,
  guildBanRemoveEvent,
  channelCreateEvent,
  channelUpdateEvent,
  channelDeleteEvent,
  roleCreateEvent,
  roleUpdateEvent,
  roleDeleteEvent,
  guildUpdateEvent,
  messageReactionAddEvent,
  messageReactionRemoveEvent,
  voiceStateUpdateEvent,
  interactionCreateEvent,
  warnEvent,
  errorEvent,
  shardDisconnectEvent,
  shardReconnectingEvent,
  shardResumeEvent,
];
