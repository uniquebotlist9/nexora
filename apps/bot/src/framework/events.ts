import type { Client } from 'discord.js';
import { errorId, serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import type { BotEvent } from './types';

/**
 * Attach typed event modules to the client. Every listener invocation is
 * wrapped so an unhandled rejection in one event can never crash the process
 * or swallow other listeners.
 */
export function attachEvents(client: Client, events: readonly BotEvent[]): void {
  const { log } = getContext();
  for (const event of events) {
    const wrapped = (...args: unknown[]): void => {
      const execute = event.execute as (...a: unknown[]) => Promise<void> | void;
      Promise.resolve(execute(...args)).catch((err: unknown) => {
        log.error(
          { err: serializeError(err), errorId: errorId(), event: event.name },
          'Unhandled error in event listener',
        );
      });
    };
    if (event.once) {
      client.once(event.name, wrapped);
    } else {
      client.on(event.name, wrapped);
    }
  }
}
