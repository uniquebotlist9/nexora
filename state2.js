/** Fresh DB state: current subscription rows + audit window to identify the Row D writer. */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const USER_ID = '1370317008167764019';

async function main() {
  const rows = await prisma.$runCommandRaw({
    find: 'Subscription',
    filter: { userId: USER_ID },
    projection: { _id: 1, plan: 1, status: 1, provider: 1, guildId: 1, createdAt: 1, updatedAt: 1, cancelAtPeriodEnd: 1 },
    limit: 20,
  });
  console.log('=== Subscriptions for user ===');
  for (const d of rows.cursor.firstBatch) console.log(JSON.stringify(d));

  // Raw Mongo `guildId: null` ALSO matches missing fields, so require $exists for explicit-null only.
  const missing = await prisma.$runCommandRaw({ count: 'Subscription', query: { guildId: { $exists: false } } });
  const explicit = await prisma.$runCommandRaw({ count: 'Subscription', query: { guildId: { $eq: null, $exists: true } } });
  console.log('=== global Subscription docs — guildId missing:', JSON.stringify(missing), ' explicit null:', JSON.stringify(explicit));

  const audits = await prisma.$runCommandRaw({
    find: 'AuditLog',
    filter: { createdAt: { $gte: new Date(Date.UTC(2026, 8, 11, 5, 0, 0)) } },
    projection: { actorType: 1, actorId: 1, guildId: 1, action: 1, targetType: 1, targetId: 1, createdAt: 1, metadata: 1 },
    limit: 50,
    sort: { createdAt: 1 },
  });
  console.log('=== AuditLog >= 05:00 UTC ===');
  for (const a of audits.cursor.firstBatch) console.log(JSON.stringify(a));

  const recent = await prisma.$runCommandRaw({
    find: 'Subscription',
    filter: { createdAt: { $gte: new Date(Date.UTC(2026, 8, 11, 5, 10, 0)) } },
    projection: { _id: 1, userId: 1, plan: 1, status: 1, guildId: 1, createdAt: 1 },
    limit: 20,
  });
  console.log('=== Subscriptions created >= 05:10 UTC ===');
  for (const d of recent.cursor.firstBatch) console.log(JSON.stringify(d));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
