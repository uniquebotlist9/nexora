import type {
  ChatInputCommandInteraction,
  ClientEvents,
  Guild,
  GuildMember,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { GuildSettings } from '@nexora/database';

export type CommandCategory =
  | 'general'
  | 'moderation'
  | 'config'
  | 'tickets'
  | 'giveaways'
  | 'social'
  | 'leveling'
  | 'economy'
  | 'roles'
  | 'automod'
  | 'automations'
  | 'backup'
  | 'utility';

export interface CategoryMeta {
  name: CommandCategory;
  label: string;
  emoji: string;
  description: string;
}

/** Everything a command execution needs, resolved and validated by the handler. */
export interface CommandContext {
  interaction: ChatInputCommandInteraction;
  guild: Guild;
  member: GuildMember;
  settings: GuildSettings;
  /** Respond with a localized string for this guild's language. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

/** The builder shape produced by SlashCommandBuilder (with or without subcommands/options). */
export type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export interface BotCommand {
  data: CommandData;
  category: CommandCategory;
  /** Per-command cooldown override; default comes from GuildSettings. */
  cooldownSeconds?: number;
  /** Extra member permission bits required beyond default_member_permissions. */
  memberPermissions?: readonly bigint[];
  /** Permission bits the bot itself must hold in the guild. */
  botPermissions?: readonly bigint[];
  execute(ctx: CommandContext): Promise<void>;
}

/** Typed gateway event listener module. */
export interface BotEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(...args: ClientEvents[K]): Promise<void> | void;
}
