/**
 * One-off maintenance script for the "personal plan isn't updating" incident:
 *  1. Dump every audit log + payment event in the incident window (03:40–05:10 UTC)
 *     to confirm which writers touched the subscriptions.
 *  2. Cancel the duplicate active PRO personal subscription for the affected
 *     user, leaving the ENTERPRISE row as the single active personal sub.
 *  3. Write a SYSTEM audit entry documenting the manual data fix.
 *  4. Verify plan resolution under the new (updatedAt-first) and old rules.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const USER_ID = '1370317008167764019';
const WINDOW_START = new Date('2026-09-11T03:40:00Z');
const WINDOW_END = new Date('2026-09-11T05:10:00Z');

async function main() {
  // 1. Incident-window audit trail (ALL actions, not just *subscription*).
  const audits = await prisma.auditLog.findMany({
    where: { createdAt: { gte: WINDOW_START, lte: WINDOW_END } },
    orderBy: { createdAt: 'asc' },
  });
  console.log('=== Audit logs 03:40-05:10 UTC ===');
  for (const a of audits) {
    console.log(
      `${a.createdAt.toISOString()} ${a.actorType}/${a.actorId ?? '-'} ${a.action}` +
        ` target=${a.targetType ?? ''}:${a.targetId ?? ''} meta=${JSON.stringify(a.metadata)}`,
    );
  }

  const payments = await prisma.paymentEvent.findMany({
    where: { createdAt: { gte: WINDOW_START, lte: WINDOW_END } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`PaymentEvents in window: ${payments.length}`);
  for (const p of payments) {
    console.log(`  ${p.createdAt.toISOString()} ${p.provider} ${p.type} ${p.eventId}`);
  }

  // 2. Full subscription state before the fix.
  const before = await prisma.subscription.findMany({
    where: { userId: USER_ID },
    orderBy: { createdAt: 'asc' },
  });
  console.log('=== Subscriptions before fix ===');
  for (const s of before) {
    console.log(
      `${s.id} guild=${s.guildId ?? 'personal'} plan=${s.plan} status=${s.status} provider=${s.provider}` +
        ` ref=${s.providerRef ?? '-'} created=${s.createdAt.toISOString()} updated=${s.updatedAt.toISOString()}` +
        ` periodEnd=${s.currentPeriodEnd ? s.currentPeriodEnd.toISOString() : 'null'} cancelAtEnd=${s.cancelAtPeriodEnd}`,
    );
  }

  // 3. Data fix: cancel the duplicate active PRO personal row.
  const dup = await prisma.subscription.findFirst({
    where: { userId: USER_ID, guildId: null, plan: 'PRO', status: { in: ['ACTIVE', 'TRIALING'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (dup) {
    await prisma.subscription.update({
      where: { id: dup.id },
      data: { status: 'CANCELLED', cancelAtPeriodEnd: false },
    });
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'maintenance.subscription.dedupe',
        targetType: 'Subscription',
        targetId: dup.id,
        metadata: {
          userId: USER_ID,
          guildId: null,
          fromPlan: 'PRO',
          toStatus: 'CANCELLED',
          reason:
            'duplicate active personal subscription (PRO 04:46 grant + ENTERPRISE row re-activated manually); keeping the ENTERPRISE row, see plan-resolution fix 2026-09-11',
        },
      },
    });
    console.log(`FIXED: cancelled duplicate PRO row ${dup.id}, SYSTEM audit written.`);
  } else {
    console.log('No active PRO personal row found (nothing to fix).');
  }

  // 4. Verify resolution under both orderings.
  const active = await prisma.subscription.findMany({
    where: { userId: USER_ID, guildId: null, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
  });
  console.log(`Active personal subs after fix: ${active.map((s) => `${s.plan}(${s.status})`).join(', ')}`);
  for (const [label, orderBy] of [
    ['new rule (updatedAt desc)', [{ updatedAt: 'desc' }, { createdAt: 'desc' }]],
    ['old rule (createdAt desc)', [{ createdAt: 'desc' }]],
  ]) {
    const resolved = await prisma.subscription.findFirst({
      where: { guildId: null, userId: USER_ID, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      orderBy,
      select: { plan: true },
    });
    console.log(`Profile resolution ${label}: ${resolved?.plan ?? 'FREE'}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
