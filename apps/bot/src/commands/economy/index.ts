import type { BotCommand } from '../../framework/types';
import {
  balanceCommand,
  bankCommand,
  crimeCommand,
  dailyCommand,
  payCommand,
  robCommand,
  weeklyCommand,
  workCommand,
} from './currency';
import { buyCommand, inventoryCommand, shopCommand } from './shop';

export const economyCommands: readonly BotCommand[] = [
  balanceCommand,
  bankCommand,
  dailyCommand,
  weeklyCommand,
  workCommand,
  crimeCommand,
  robCommand,
  payCommand,
  shopCommand,
  buyCommand,
  inventoryCommand,
];
