import type { GuildMember, PartialGuildMember } from 'discord.js';
import { getContext } from '../core/context';
import { truncate } from '../core/utils';
import { dispatchAutomationTrigger } from '../services/automations';
import { logEvent } from '../services/logging';
import type { BotEvent } from '../framework/types';

export const guildMemberUpdateEvent: BotEvent<'guildMemberUpdate'> = {
  name: 'guildMemberUpdate',
  async execute(oldMember: GuildMember | PartialGuildMember | null, newMember: GuildMember) {
    const guild = newMember.guild;

    // Role changes → automations + logging.
    if (oldMember && !oldMember.partial) {
      const added = [...newMember.roles.cache.keys()].filter((id) => !oldMember.roles.cache.has(id));
      const removed = [...oldMember.roles.cache.keys()].filter((id) => !newMember.roles.cache.has(id));

      for (const roleId of added) {
        await dispatchAutomationTrigger(guild, 'ROLE_ADDED', { member: newMember, roleId }).catch(() => undefined);
      }
      for (const roleId of removed) {
        await dispatchAutomationTrigger(guild, 'ROLE_REMOVED', { member: newMember, roleId }).catch(() => undefined);
      }

      if (added.length > 0 || removed.length > 0) {
        await logEvent(guild, 'roleChanges', {
          action: 'Member roles changed',
          targetId: newMember.id,
          metadata: {
            added: added.map((id) => `<@&${id}>`).join(', ') || '—',
            removed: removed.map((id) => `<@&${id}>`).join(', ') || '—',
          },
          title: 'Member roles updated',
        });
      }
    }

    // Nickname change logging.
    if (oldMember && oldMember.nickname !== newMember.nickname) {
      await logEvent(guild, 'nickname', {
        action: 'Nickname changed',
        targetId: newMember.id,
        metadata: {
          before: truncate(oldMember.nickname ?? '(none)', 100),
          after: truncate(newMember.nickname ?? '(none)', 100),
        },
        title: 'Nickname updated',
      });
    }
  },
};
