import type { CloseEvent } from 'discord.js';
import { getContext } from '../core/context';
import type { BotEvent } from '../framework/types';

export const warnEvent: BotEvent<'warn'> = {
  name: 'warn',
  execute(info: string) {
    getContext().log.warn({ info }, 'Client warning');
  },
};

export const errorEvent: BotEvent<'error'> = {
  name: 'error',
  execute(error: Error) {
    getContext().log.error({ err: { message: error.message, stack: error.stack } }, 'Client error');
  },
};

export const shardDisconnectEvent: BotEvent<'shardDisconnect'> = {
  name: 'shardDisconnect',
  execute(closeEvent: CloseEvent, shardId: number) {
    getContext().log.warn({ code: closeEvent.code, reason: closeEvent.reason, shardId }, 'Shard disconnected');
  },
};

export const shardReconnectingEvent: BotEvent<'shardReconnecting'> = {
  name: 'shardReconnecting',
  execute(shardId: number) {
    getContext().log.warn({ shardId }, 'Shard reconnecting');
  },
};

export const shardResumeEvent: BotEvent<'shardResume'> = {
  name: 'shardResume',
  execute(shardId: number, replayedEvents: number) {
    getContext().log.info({ shardId, replayedEvents }, 'Shard resumed');
  },
};
