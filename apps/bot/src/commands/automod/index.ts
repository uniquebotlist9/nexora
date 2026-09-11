import type { BotCommand } from '../../framework/types';
import { automodCommand } from './automod';

export const automodCommands: readonly BotCommand[] = [automodCommand];
