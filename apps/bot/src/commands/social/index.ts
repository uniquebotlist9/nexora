import type { BotCommand } from '../../framework/types';
import { pollCommand, starboardCommand, suggestionCommand } from './social';

export const socialCommands: readonly BotCommand[] = [pollCommand, suggestionCommand, starboardCommand];
