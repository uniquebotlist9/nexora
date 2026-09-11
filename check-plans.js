// Temporary diagnostic: inspect subscriptions and plan resolution.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const subs = await prisma.subscription.findMany({ orderBy: { createdAt: 'asc' } });
  console.log(`=== SUBSCRIPTIONS (${subs.length}) ===`);
  for (const s of subs) {
    console.log(
      `id=${s.id} userId=${s.userId} guildId=${s.guildId ?? 'null'} plan=${s.plan} status=${s.status}` +
      ` provider=${s.provider} periodEnd=${s.currentPeriodEnd ? s.currentPeriodEnd.toISOString() : 'null'}` +
      ` created=${s.createdAt.toISOString()} updated=${s.updatedAt.toISOString()}`,
    );
  }

  const users = await prisma.user.findMany({ select: { id: true, lastSeenAt: true } });
  console.log(`\n=== USERS (${users.length}) ===`);
  for (const u of users) {
    const mine = subs.filter((s) => s.userId === u.id);
    const personal = mine.filter((s) => s.guildId === null && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(s.status));
    const resolved = personal.sort((a, b) => b.createdAt - a.createdAt)[0];
    console.log(`user=${u.id} subs=${mine.length} personalActive=${personal.length} -> profile plan shows: ${resolved ? resolved.plan : 'FREE'}`);
  }

  const audits = await prisma.auditLog.findMany({
    where: { action: { contains: 'subscription' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(`\n=== SUBSCRIPTION AUDIT LOGS (last 10) ===`);
  for (const a of audits) {
    console.log(`${a.createdAt.toISOString()} ${a.action} metadata=${JSON.stringify(a.metadata)}`);
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error('FAILED:', e.message); prisma.$disconnect(); process.exit(1); });
