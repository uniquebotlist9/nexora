import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { loadRoles } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { EconomyEditor, type ShopItemView } from './economy-editor';
import type { EconomyConfigInput } from '@/app/dashboard/g/[guildId]/leveling/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Economy' };

export default async function EconomyPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, limits } = ctx;

  const [config, roles, items] = await Promise.all([
    prisma.economyConfig.findUnique({ where: { guildId: guild.id } }),
    loadRoles(guild.id),
    prisma.shopItem.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const initial: EconomyConfigInput = {
    enabled: config?.enabled ?? false,
    currencyName: config?.currencyName ?? 'coins',
    currencySymbol: config?.currencySymbol ?? '🪙',
    dailyAmount: config?.dailyAmount ?? 100,
    weeklyAmount: config?.weeklyAmount ?? 500,
    workCooldownMinutes: config?.workCooldownMinutes ?? 60,
    workMin: config?.workMin ?? 50,
    workMax: config?.workMax ?? 150,
    crimeCooldownMinutes: config?.crimeCooldownMinutes ?? 180,
    crimeSuccessRate: config?.crimeSuccessRate ?? 0.5,
    crimeFineMax: config?.crimeFineMax ?? 200,
    startingBalance: config?.startingBalance ?? 0,
  };

  const shopItems: ShopItemView[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    price: i.price,
    roleId: i.roleId,
    stock: i.stock,
    enabled: i.enabled,
  }));

  return (
    <div>
      <PageHeader
        title="Economy"
        description="Virtual currency with dailies, work, crime and a role-granting shop."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Economy' }]}
      />
      <EconomyEditor
        guildId={guild.id}
        initial={initial}
        roles={roles}
        shopItems={shopItems}
        economyUnlocked={limits.economy}
      />
    </div>
  );
}
