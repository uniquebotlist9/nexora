import type { BotCommand } from '../../framework/types';
import { helpCommand } from './help';
import { pingCommand } from './ping';
import { afkCommand } from './afk';
import { serverinfoCommand, userinfoCommand, avatarCommand, profileCommand } from './info';
import { remindCommand } from './remind';

export const generalCommands: readonly BotCommand[] = [
  helpCommand,
  pingCommand,
  afkCommand,
  serverinfoCommand,
  userinfoCommand,
  avatarCommand,
  profileCommand,
  remindCommand,
];
