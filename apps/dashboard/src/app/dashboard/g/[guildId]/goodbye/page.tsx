import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { loadRoles, loadChannels, parseJsonColumn } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { WelcomeGoodbyeEditor, type WelcomeEditorState } from '@/app/dashboard/g/[guildId]/welcome/welcome-goodbye-editor';
import type { MessagePayload } from '@nexora/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Goodbye' };

export default async function GoodbyePage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, limits } = ctx;

  const [config, roles, channels] = await Promise.all([
    prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } }),
    loadRoles(guild.id),
    loadChannels(guild.id),
  ]);

  const initial: WelcomeEditorState = {
    welcomeEnabled: config?.welcomeEnabled ?? false,
    welcomeChannelId: config?.welcomeChannelId ?? null,
    welcomeMessage: parseJsonColumn<MessagePayload | null>(config?.welcomeMessage, null),
    welcomeDmEnabled: config?.welcomeDmEnabled ?? false,
    welcomeDmMessage: parseJsonColumn<MessagePayload | null>(config?.welcomeDmMessage, null),
    welcomeCardEnabled: config?.welcomeCardEnabled ?? false,
    autoRoleIds: config?.autoRoleIds ?? [],
    farewellEnabled: config?.farewellEnabled ?? false,
    farewellChannelId: config?.farewellChannelId ?? null,
    farewellMessage: parseJsonColumn<MessagePayload | null>(config?.farewellMessage, null),
    farewellCardEnabled: config?.farewellCardEnabled ?? false,
  };

  return (
    <div>
      <PageHeader
        title="Goodbye"
        description="Send off departing members with a farewell message and optional image card."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Goodbye' }]}
      />
      <WelcomeGoodbyeEditor
        guildId={guild.id}
        mode="goodbye"
        initial={initial}
        channels={channels}
        roles={roles}
        cardsUnlocked={limits.welcomeCards}
      />
    </div>
  );
}
