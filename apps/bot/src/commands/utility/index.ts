import type { BotCommand } from '../../framework/types';
import { announceCommand, embedCommand } from './embed';

export const utilityCommands: readonly BotCommand[] = [embedCommand, announceCommand];
