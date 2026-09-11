import type { BotCommand } from '../../framework/types';
import { configCommand, settingsCommand } from './settings';
import { farewellCommand, welcomeCommand } from './welcome';
import { autoroleCommand, logsCommand } from './logs';
import { automessageCommand, stickyCommand } from './sticky';

export const configCommands: readonly BotCommand[] = [
  settingsCommand,
  configCommand,
  welcomeCommand,
  farewellCommand,
  autoroleCommand,
  logsCommand,
  automessageCommand,
  stickyCommand,
];
