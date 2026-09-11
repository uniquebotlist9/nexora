import type { BotCommand } from '../../framework/types';
import {
  banCommand,
  kickCommand,
  muteCommand,
  softbanCommand,
  timeoutCommand,
  unmuteCommand,
  unbanCommand,
  warnCommand,
} from './actions';
import { lockCommand, nickCommand, purgeCommand, slowmodeCommand, unlockCommand } from './channels';
import { appealCommand, caseCommand, modhistoryCommand } from './cases';

export const moderationCommands: readonly BotCommand[] = [
  warnCommand,
  timeoutCommand,
  muteCommand,
  unmuteCommand,
  kickCommand,
  banCommand,
  unbanCommand,
  softbanCommand,
  lockCommand,
  unlockCommand,
  slowmodeCommand,
  purgeCommand,
  nickCommand,
  caseCommand,
  modhistoryCommand,
  appealCommand,
];
