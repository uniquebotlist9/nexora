import type { BotCommand } from '../../framework/types';
import { leaderboardCommand, rankCommand } from './leaderboard';

export const levelingCommands: readonly BotCommand[] = [rankCommand, leaderboardCommand];
