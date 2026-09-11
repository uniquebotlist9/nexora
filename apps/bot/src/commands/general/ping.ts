import { brandEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { getContext } from '../../core/context';

export const pingCommand: BotCommand = {
  data: guildCommand('ping', 'Check the bot latency and responsiveness'),
  category: 'general',
  async execute(ctx) {
    const { client } = getContext();
    const start = Date.now();
    await ctx.interaction.deferReply();
    const roundtrip = Date.now() - start;
    const wsPing = Math.max(client.ws.ping, 0);
    const uptime = process.uptime();
    const embed = brandEmbed()
      .setTitle('🏓 Pong!')
      .addFields(
        { name: 'WebSocket', value: `${wsPing}ms`, inline: true },
        { name: 'Roundtrip', value: `${roundtrip}ms`, inline: true },
        {
          name: 'Uptime',
          value: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
          inline: true,
        },
      );
    await ctx.interaction.editReply({ embeds: [embed] }).catch(() => undefined);
  },
};
