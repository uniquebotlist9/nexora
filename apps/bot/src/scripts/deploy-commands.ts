import { REST, Routes } from 'discord.js';
import { requireEnv } from '@nexora/config';
import { allCommands } from '../commands/registry';

/**
 * Register every slash command from the registry.
 *
 * Global registration by default (used in production); passing a guild ID as
 * the first argument registers guild-scoped commands instead, which appear
 * instantly and are handy during development.
 *
 * Usage: npm run deploy-commands            (global, via the workspace script)
 *        npx tsx apps/bot/src/scripts/deploy-commands.ts [guildId]
 */
async function main(): Promise<void> {
  const token = requireEnv('DISCORD_TOKEN');
  const clientId = requireEnv('DISCORD_CLIENT_ID');
  const guildId = process.argv[2] ?? process.env.DISCORD_GUILD_ID;

  const rest = new REST({ version: '10' }).setToken(token);
  const body = allCommands.map((command) => command.data.toJSON());

  if (guildId) {
    const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`Registered ${(data as unknown[]).length} guild command(s) in guild ${guildId}`);
  } else {
    const data = await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(`Registered ${(data as unknown[]).length} global command(s)`);
  }
  console.log(
    `Commands: ${allCommands
      .map((command) => command.data.name)
      .sort()
      .join(', ')}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
