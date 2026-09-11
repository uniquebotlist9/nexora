import type { BotCommand, CommandCategory, CategoryMeta } from '../framework/types';
import { generalCommands } from './general';
import { moderationCommands } from './moderation';
import { configCommands } from './config';
import { ticketCommands } from './tickets';
import { giveawayCommands } from './giveaways';
import { socialCommands } from './social';
import { levelingCommands } from './leveling';
import { economyCommands } from './economy';
import { rolesCommands } from './roles';
import { automodCommands } from './automod';
import { automationCommands } from './automations';
import { backupCommands } from './backup';
import { utilityCommands } from './utility';

/** Every slash command the bot registers, in one flat registry. */
export const allCommands: readonly BotCommand[] = [
  ...generalCommands,
  ...moderationCommands,
  ...configCommands,
  ...ticketCommands,
  ...giveawayCommands,
  ...socialCommands,
  ...levelingCommands,
  ...economyCommands,
  ...rolesCommands,
  ...automodCommands,
  ...automationCommands,
  ...backupCommands,
  ...utilityCommands,
];

export const categoryMeta: Record<CommandCategory, CategoryMeta> = {
  general: { name: 'general', label: 'General', emoji: '🌐', description: 'Help, info and everyday utilities.' },
  moderation: { name: 'moderation', label: 'Moderation', emoji: '🛡️', description: 'Warns, timeouts, bans, purges and case management.' },
  config: { name: 'config', label: 'Configuration', emoji: '⚙️', description: 'Server settings, welcome, logs, autoroles and sticky messages.' },
  tickets: { name: 'tickets', label: 'Tickets', emoji: '🎫', description: 'Support ticket system setup and panels.' },
  giveaways: { name: 'giveaways', label: 'Giveaways', emoji: '🎉', description: 'Create and manage giveaways.' },
  social: { name: 'social', label: 'Social', emoji: '💬', description: 'Polls, suggestions and the starboard.' },
  leveling: { name: 'leveling', label: 'Leveling', emoji: '📈', description: 'XP ranks and leaderboards.' },
  economy: { name: 'economy', label: 'Economy', emoji: '🪙', description: 'Currency, work, crime, banking and the shop.' },
  roles: { name: 'roles', label: 'Roles', emoji: '🎭', description: 'Reaction role panels.' },
  automod: { name: 'automod', label: 'AutoMod', emoji: '🤖', description: 'Automatic message moderation rules.' },
  automations: { name: 'automations', label: 'Automations', emoji: '⚡', description: 'If-this-then-that workflows (built on the dashboard).' },
  backup: { name: 'backup', label: 'Backups', emoji: '💾', description: 'Server structure snapshots and restore.' },
  utility: { name: 'utility', label: 'Utility', emoji: '🧰', description: 'Embed builder and announcements.' },
};

const commandMap = new Map(allCommands.map((command) => [command.data.name, command]));

export function getCommand(name: string): BotCommand | undefined {
  return commandMap.get(name);
}

/** Sanity check: no duplicate command names (runs once at import). */
const names = new Set<string>();
for (const command of allCommands) {
  if (names.has(command.data.name)) {
    throw new Error(`Duplicate command name registered: ${command.data.name}`);
  }
  names.add(command.data.name);
}
