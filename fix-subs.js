/**
 * One-time reconciliation for the personal-subscription null-vs-missing bug.
 *
 * Bug: personal subs were created WITHOUT a guildId field; Prisma's MongoDB
 * connector only matches `guildId: null` filters against EXPLICIT BSON null,
 * so those rows were invisible to plan resolution and admin-grant lookups.
 *
 * Fix: (1) backfill explicit guildId:null on every Subscription doc missing
 * the field; (2) cancel duplicate active personal subs for the affected user,
 * keeping the deliberate ENTERPRISE grant; (3) SYSTEM audit entry; (4) verify.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const USER_ID = '1370317008167764019';
const KEEP_ID = 'cmtwezvfw0001tu24kji443v2'; // personal ENTERPRISE (03:46 grant, resumed on billing page)

async function main() {
  // ---- Pre-flight: fresh state + recent activity (typed client: correct dates) ----
  const recentAudits = await prisma.auditLog.findMany({
    where: { createdAt: { gte: new Date(Date.UTC(2026, 8, 11, 5, 0, 0)) } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  console.log('audits since 05:00 UTC:', recentAudits.map((a) => `${a.createdAt.toISOString()} ${a.action}`).join(' | ') || '(none)');

  const personal = await prisma.subscription.findMany({
    where: { userId: USER_ID, provider: 'internal' },
    orderBy: { createdAt: 'asc' },
  });
  console.log('current personal internal subs:');
  for (const s of personal) console.log(`  ${s.id} plan=${s.plan} status=${s.status} createdAt=${s.createdAt.toISOString()}`);

  const keep = personal.find((s) => s.id === KEEP_ID);
  if (!keep || keep.plan !== 'ENTERPRISE' || !['ACTIVE', 'TRIALING'].includes(keep.status)) {
    throw new Error(`Pre-flight failed: row to keep (${KEEP_ID}) is not an active ENTERPRISE sub — aborting, nothing changed.`);
  }
  const toCancel = personal.filter((s) => s.id !== KEEP_ID && ['ACTIVE', 'TRIALING'].includes(s.status));
  console.log('plan: keep ENTERPRISE row, cancel:', toCancel.map((s) => `${s.id}(${s.plan})`).join(', ') || '(none)');

  // ---- 1) Backfill: explicit guildId:null wherever the field is missing ----
  const backfill = await prisma.$runCommandRaw({
    update: 'Subscription',
    updates: [{ q: { guildId: { $exists: false } }, u: { $set: { guildId: null } }, multi: true }],
  });
  console.log('backfill $set guildId:null ->', JSON.stringify(backfill));
  if (backfill.n !== backfill.nModified) console.log('note: n != nModified (docs already null or missing)');

  // ---- 2) Collapse duplicates: one active internal personal sub per user ----
  let cancelledCount = 0;
  if (toCancel.length > 0) {
    const res = await prisma.subscription.updateMany({
      where: { id: { in: toCancel.map((s) => s.id) } },
      data: { status: 'CANCELLED', cancelAtPeriodEnd: false },
    });
    cancelledCount = res.count;
    console.log('cancelled duplicates:', res.count);
  }

  // ---- 3) SYSTEM audit entry documenting the reconciliation ----
  await prisma.auditLog.create({
    data: {
      actorType: 'SYSTEM',
      actorId: null,
      guildId: null,
      action: 'maintenance.subscription.reconcile',
      targetType: 'Subscription',
      targetId: KEEP_ID,
      metadata: {
        userId: USER_ID,
        keptPlan: 'ENTERPRISE',
        backfilledNullGuildId: backfill.nModified ?? backfill.n,
        cancelledIds: toCancel.map((s) => s.id),
        fromPlans: toCancel.map((s) => s.plan),
        reason: 'duplicate active personal subscriptions — Prisma Mongo null-filter mismatch (missing guildId field never matched guildId:null queries); kept single ENTERPRISE row',
      },
    },
  });
  console.log('SYSTEM audit entry written');

  // ---- 4) Verify ----
  const resolution = await prisma.subscription.findFirst({
    where: { guildId: null, userId: USER_ID, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
  console.log('profile-resolution row:', resolution ? `${resolution.id} plan=${resolution.plan}` : 'NONE');

  const grantLookup = await prisma.subscription.findFirst({
    where: { userId: USER_ID, guildId: null, provider: 'internal', status: { in: ['ACTIVE', 'TRIALING'] } },
    orderBy: { createdAt: 'desc' },
  });
  console.log('admin-grant lookup row:', grantLookup ? `${grantLookup.id} plan=${grantLookup.plan} (next grant will UPDATE this row)` : 'NONE');

  const activeCount = await prisma.subscription.count({
    where: { userId: USER_ID, guildId: null, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
  });
  console.log('active personal subs after fix (expect 1):', activeCount);

  const stillMissing = await prisma.$runCommandRaw({ count: 'Subscription', query: { guildId: { $exists: false } } });
  console.log('Subscription docs still missing guildId (expect 0):', stillMissing.n);

  const ok = resolution && resolution.id === KEEP_ID && resolution.plan === 'ENTERPRISE' && grantLookup && grantLookup.id === KEEP_ID && activeCount === 1 && stillMissing.n === 0;
  console.log(ok ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED');
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
