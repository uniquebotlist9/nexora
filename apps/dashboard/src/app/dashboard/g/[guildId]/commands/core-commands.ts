/**
 * Static reference of Nexora's core command registry (mirrors the bot's
 * command definitions). Displayed read-only on the Commands page.
 */
export interface CoreCommand {
  name: string;
  category: string;
  permission: string;
  description: string;
}

export const CORE_COMMANDS: CoreCommand[] = [
  // Moderation
  { name: '/ban', category: 'Moderation', permission: 'Ban Members', description: 'Ban a member with optional evidence and case number.' },
  { name: '/tempban', category: 'Moderation', permission: 'Ban Members', description: 'Ban a member for a fixed duration.' },
  { name: '/unban', category: 'Moderation', permission: 'Ban Members', description: 'Lift a ban by user ID.' },
  { name: '/kick', category: 'Moderation', permission: 'Kick Members', description: 'Kick a member with a reason.' },
  { name: '/timeout', category: 'Moderation', permission: 'Moderate Members', description: 'Time a member out for a duration.' },
  { name: '/untimeout', category: 'Moderation', permission: 'Moderate Members', description: 'Remove an active timeout.' },
  { name: '/warn', category: 'Moderation', permission: 'Moderate Members', description: 'Issue a warning with points.' },
  { name: '/warnings', category: 'Moderation', permission: '—', description: 'View a member’s warning history.' },
  { name: '/clearwarnings', category: 'Moderation', permission: 'Moderate Members', description: 'Clear some or all warnings.' },
  { name: '/purge', category: 'Moderation', permission: 'Manage Messages', description: 'Bulk delete messages with filters.' },
  { name: '/case', category: 'Moderation', permission: '—', description: 'Look up a moderation case with evidence.' },
  { name: '/lockdown', category: 'Moderation', permission: 'Manage Channels', description: 'Toggle server or channel lockdown.' },
  // Tickets
  { name: '/ticket', category: 'Tickets', permission: '—', description: 'Open a support ticket.' },
  { name: '/close', category: 'Tickets', permission: '—', description: 'Close the current ticket with a transcript.' },
  { name: '/claim', category: 'Tickets', permission: 'Staff role', description: 'Claim the current ticket.' },
  // Giveaways
  { name: '/giveaway start', category: 'Giveaways', permission: 'Manage Guild', description: 'Start a giveaway with requirements.' },
  { name: '/giveaway end', category: 'Giveaways', permission: 'Manage Guild', description: 'End a giveaway early.' },
  { name: '/giveaway reroll', category: 'Giveaways', permission: 'Manage Guild', description: 'Reroll winners of an ended giveaway.' },
  // Levels & economy
  { name: '/rank', category: 'Leveling', permission: '—', description: 'Show your or another member’s rank card.' },
  { name: '/leaderboard', category: 'Leveling', permission: '—', description: 'Top members by XP or messages.' },
  { name: '/daily', category: 'Economy', permission: '—', description: 'Claim your daily currency.' },
  { name: '/weekly', category: 'Economy', permission: '—', description: 'Claim your weekly currency.' },
  { name: '/work', category: 'Economy', permission: '—', description: 'Work for currency (cooldown applies).' },
  { name: '/crime', category: 'Economy', permission: '—', description: 'Risk it all for extra currency.' },
  { name: '/shop', category: 'Economy', permission: '—', description: 'Browse the server shop.' },
  { name: '/buy', category: 'Economy', permission: '—', description: 'Buy a shop item.' },
  { name: '/balance', category: 'Economy', permission: '—', description: 'Check a wallet and bank balance.' },
  // Utility
  { name: '/verify', category: 'Utility', permission: '—', description: 'Verify into the server.' },
  { name: '/remind', category: 'Utility', permission: '—', description: 'Set a personal reminder.' },
  { name: '/afk', category: 'Utility', permission: '—', description: 'Set an AFK status.' },
  { name: '/birthday', category: 'Utility', permission: '—', description: 'Set your birthday for announcements.' },
  { name: '/suggestion', category: 'Utility', permission: '—', description: 'Submit a suggestion.' },
  { name: '/help', category: 'Utility', permission: '—', description: 'Command overview with links.' },
  { name: '/serverinfo', category: 'Utility', permission: '—', description: 'Server information snapshot.' },
  { name: '/userinfo', category: 'Utility', permission: '—', description: 'Member information snapshot.' },
  // Admin
  { name: '/backup create', category: 'Admin', permission: 'Administrator', description: 'Create a configuration backup.' },
  { name: '/backup restore', category: 'Admin', permission: 'Administrator', description: 'Restore a backup by id.' },
  { name: '/automod', category: 'Admin', permission: 'Manage Guild', description: 'AutoMod rule overview.' },
  { name: '/stats', category: 'Admin', permission: 'Manage Guild', description: 'Server analytics snapshot.' },
];
