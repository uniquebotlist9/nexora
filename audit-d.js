/** Identify the creator of Row D via audit logs. */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const audits = await prisma.$runCommandRaw({
    find: 'AuditLog',
    filter: { createdAt: { $gte: new Date(Date.UTC(2026, 8, 11, 4, 40, 0)), $lt: new Date(Date.UTC(2026, 8, 11, 5, 20, 0)) } },
    projection: { actorType: 1, actorId: 1, guildId: 1, action: 1, targetType: 1, targetId: 1, createdAt: 1, metadata: 1 },
    limit: 60,
    sort: { createdAt: 1 },
  });
  console.log('=== AuditLog 04:40 - 05:20 UTC ===');
  for (const a of audits.cursor.firstBatch) console.log(JSON.stringify(a));

  const byTarget = await prisma.$runCommandRaw({
    find: 'AuditLog',
    filter: { targetType: 'Subscription' },
    projection: { actorType: 1, actorId: 1, action: 1, targetId: 1, createdAt: 1, metadata: 1 },
    limit: 40,
    sort: { createdAt: 1 },
  });
  console.log('=== ALL AuditLog targeting Subscription ===');
  for (const a of byTarget.cursor.firstBatch) console.log(JSON.stringify(a));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
