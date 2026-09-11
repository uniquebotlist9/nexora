import type { BotCommand } from '../../framework/types';
import { backupCommand } from './backup';

export const backupCommands: readonly BotCommand[] = [backupCommand];
