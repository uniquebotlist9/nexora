import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

/**
 * Standard slash-command builder preset: guild-only context plus optional
 * default member permissions. Every command in the bot goes through this so
 * DM permission flags are consistent everywhere.
 */
export function guildCommand(name: string, description: string, defaultPermissions?: bigint): SlashCommandBuilder {
  const builder = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setContexts(InteractionContextType.Guild);
  if (defaultPermissions !== undefined) {
    builder.setDefaultMemberPermissions(defaultPermissions);
  }
  return builder;
}
