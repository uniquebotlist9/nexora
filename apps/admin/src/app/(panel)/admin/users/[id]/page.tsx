import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Coins,
  CreditCard,
  Gavel,
  KeyRound,
  Server,
  Users,
} from 'lucide-react';
import { prisma } from '@nexora/database';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { RoleGate } from '@/components/shared/role-gate';
import {
  APPEAL_STATUS_VARIANT,
  CASE_TYPE_VARIANT,
  PLAN_VARIANT,
  SUBSCRIPTION_STATUS_VARIANT,
} from '@/lib/badges';
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { canViewBilling, SUBSCRIPTION_MUTATION_ROLES, SYSTEM_OPS_ROLES } from '@/lib/roles';
import { requirePage } from '@/lib/session';
import { RevokeApiKeyButton, UserPremiumGrant } from './user-actions';

export const dynamic = 'force-dynamic';

export default async function UserDetailPage({ params }: { params: { id: string } }) {
  const session = await requirePage('users');
  const role = session.user.adminRole;
  const showBilling = canViewBilling(role);

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      _count: {
        select: { guildMemberships: true, subscriptions: true, apiKeys: true },
      },
    },
  });
  if (!user) notFound();

  const [memberships, economyAccounts, modCases, apiKeys, subscriptions] = await Promise.all([
    prisma.guildMember.findMany({
      where: { userId: user.id },
      orderBy: { joinedAt: 'desc' },
      take: 25,
      select: {
        id: true,
        joinedAt: true,
        leftAt: true,
        isStaff: true,
        xp: true,
        messageCount: true,
        voiceMinutes: true,
        guild: { select: { id: true, name: true, active: true } },
      },
    }),
    prisma.economyAccount.findMany({
      where: { userId: user.id },
      orderBy: { balance: 'desc' },
      select: {
        id: true,
        balance: true,
        bank: true,
        lastDaily: true,
        guild: { select: { id: true, name: true } },
      },
    }),
    prisma.moderationCase.findMany({
      where: { targetUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        caseNumber: true,
        type: true,
        reason: true,
        active: true,
        createdAt: true,
        guild: { select: { id: true, name: true } },
        appeal: { select: { status: true } },
      },
    }),
    prisma.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
    prisma.subscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        plan: true,
        status: true,
        provider: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        createdAt: true,
      },
    }),
  ]);

  const hasActiveSub = subscriptions.some(
    (sub) => sub.status === 'ACTIVE' || sub.status === 'TRIALING',
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
          <Users className="h-6 w-6 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-lg font-semibold tracking-tight">{user.id}</h2>
            {hasActiveSub ? (
              subscriptions
                .filter((sub) => sub.status === 'ACTIVE' || sub.status === 'TRIALING')
                .slice(0, 1)
                .map((sub) => (
                  <Badge key={sub.id} variant={PLAN_VARIANT[sub.plan] ?? 'muted'}>
                    {sub.plan}
                  </Badge>
                ))
            ) : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>first seen {formatDateTime(user.createdAt)}</span>
            <span>last seen {formatRelative(user.lastSeenAt)}</span>
            <span>{formatNumber(user._count.guildMemberships)} guild memberships</span>
            <span>{formatNumber(user._count.apiKeys)} API keys</span>
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-muted-foreground" />
              Guild memberships
            </CardTitle>
            <CardDescription>Up to 25 most recent memberships.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {memberships.length === 0 ? (
              <EmptyState
                icon={Server}
                title="No memberships"
                description="This user is not a member of any known guild."
                className="border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Guild</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>XP</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>Voice</TableHead>
                    <TableHead className="pr-6">Staff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberships.map((membership) => (
                    <TableRow key={membership.id}>
                      <TableCell className="pl-6">
                        <Link
                          href={`/admin/guilds/${membership.guild.id}`}
                          className="font-medium hover:underline"
                        >
                          {membership.guild.name}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(membership.joinedAt)}
                      </TableCell>
                      <TableCell>
                        {membership.leftAt ? (
                          <Badge variant="muted">left</Badge>
                        ) : membership.guild.active ? (
                          <Badge variant="success">member</Badge>
                        ) : (
                          <Badge variant="warning">guild paused</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatNumber(membership.xp)}</TableCell>
                      <TableCell>{formatNumber(membership.messageCount)}</TableCell>
                      <TableCell>{formatNumber(membership.voiceMinutes)}m</TableCell>
                      <TableCell className="pr-6">
                        {membership.isStaff ? <Badge variant="info">staff</Badge> : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="h-4 w-4 text-muted-foreground" />
                Economy accounts
              </CardTitle>
              <CardDescription>Wallet balances across guilds.</CardDescription>
            </CardHeader>
            <CardContent>
              {economyAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No economy accounts.</p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {economyAccounts.map((account) => (
                    <li
                      key={account.id}
                      className="flex items-center justify-between gap-3 rounded-md border bg-background/40 px-3 py-2"
                    >
                      <Link
                        href={`/admin/guilds/${account.guild.id}`}
                        className="min-w-0 truncate font-medium hover:underline"
                      >
                        {account.guild.name}
                      </Link>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatNumber(account.balance)} / {formatNumber(account.bank)} bank
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {showBilling ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Subscription actions
                </CardTitle>
                <CardDescription>Manual plan management for this user.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RoleGate
                  role={role}
                  roles={SUBSCRIPTION_MUTATION_ROLES}
                  fallback={
                    <p className="text-xs text-muted-foreground">
                      Managing subscriptions requires SUPPORT or above.
                    </p>
                  }
                >
                  <UserPremiumGrant userId={user.id} />
                </RoleGate>
                {subscriptions.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {subscriptions.map((sub) => (
                      <li
                        key={sub.id}
                        className="flex items-center justify-between gap-2 rounded-md border bg-background/40 px-3 py-2"
                      >
                        <span className="flex items-center gap-1.5">
                          <Badge variant={PLAN_VARIANT[sub.plan] ?? 'muted'}>{sub.plan}</Badge>
                          <Badge variant={SUBSCRIPTION_STATUS_VARIANT[sub.status] ?? 'muted'}>
                            {sub.status}
                          </Badge>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {sub.provider} · {sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-4 w-4 text-primary" />
            Moderation history
          </CardTitle>
          <CardDescription>Cases targeting this user, across all guilds.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {modCases.length === 0 ? (
            <EmptyState
              icon={Gavel}
              title="Clean record"
              description="No moderation cases target this user."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Guild</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Appeal</TableHead>
                  <TableHead className="pr-6">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modCases.map((modCase) => (
                  <TableRow key={modCase.id}>
                    <TableCell className="pl-6">
                      <Link
                        href={`/admin/guilds/${modCase.guild.id}`}
                        className="font-medium hover:underline"
                      >
                        {modCase.guild.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">#{modCase.caseNumber}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <Badge variant={CASE_TYPE_VARIANT[modCase.type] ?? 'muted'}>
                          {modCase.type}
                        </Badge>
                        {modCase.active ? null : <Badge variant="muted">resolved</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground">
                      {modCase.reason}
                    </TableCell>
                    <TableCell>
                      {modCase.appeal ? (
                        <Badge variant={APPEAL_STATUS_VARIANT[modCase.appeal.status] ?? 'muted'}>
                          {modCase.appeal.status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap pr-6 text-xs text-muted-foreground">
                      {formatRelative(modCase.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" />
            API keys
          </CardTitle>
          <CardDescription>
            Keys are stored hashed — only the prefix is ever displayed.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {apiKeys.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No API keys"
              description="This user has not created any developer API keys."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell className="pl-6 font-medium">{apiKey.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {apiKey.prefix}•••••
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {apiKey.scopes.length > 0 ? apiKey.scopes.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {apiKey.lastUsedAt ? formatRelative(apiKey.lastUsedAt) : 'never'}
                    </TableCell>
                    <TableCell>
                      {apiKey.revokedAt ? (
                        <Badge variant="destructive">revoked</Badge>
                      ) : (
                        <Badge variant="success">active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      {apiKey.revokedAt ? null : (
                        <RoleGate
                          role={role}
                          roles={SYSTEM_OPS_ROLES}
                          fallback={
                            <span className="text-xs text-muted-foreground">
                              DEVELOPER+ to revoke
                            </span>
                          }
                        >
                          <RevokeApiKeyButton
                            apiKeyId={apiKey.id}
                            name={apiKey.name}
                            prefix={apiKey.prefix}
                          />
                        </RoleGate>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
