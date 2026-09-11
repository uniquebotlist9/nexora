/** Determine how Prisma 6.19.3 + MongoDB treats null vs missing on optional fields. */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['query'] });
const USER_ID = '1370317008167764019';
const ROW_D = 'cmtwhas1o000ctu24r33twjwf'; // personal PRO row (no guildId field)

async function main() {
  console.log('--- count before (guildId field missing):', await prisma.subscription.count({ where: { userId: USER_ID, guildId: null } }));

  // Set an explicit BSON null on Row D directly in MongoDB.
  const upd = await prisma.$runCommandRaw({
    update: 'Subscription',
    updates: [{ q: { _id: ROW_D }, u: { $set: { guildId: null } } }],
  });
  console.log('--- raw $set guildId:null on Row D, modified:', JSON.stringify(upd));

  console.log('--- count after (Row D now explicit null):', await prisma.subscription.count({ where: { userId: USER_ID, guildId: null } }));

  // Does Prisma create() persist guildId null as explicit null or omit it?
  const created = await prisma.subscription.create({
    data: {
      userId: 'test-null-probe',
      plan: 'PRO',
      status: 'ACTIVE',
      provider: 'internal',
      guildId: null,
      currentPeriodEnd: new Date(),
    },
  });
  const raw = await prisma.$runCommandRaw({ find: 'Subscription', filter: { userId: 'test-null-probe' }, limit: 1 });
  console.log('--- probe row raw:', JSON.stringify(raw.cursor.firstBatch[0]));
  await prisma.subscription.delete({ where: { id: created.id } });
  console.log('--- probe deleted');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
