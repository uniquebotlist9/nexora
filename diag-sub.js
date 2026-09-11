/** Isolate which where-condition fails against MongoDB for personal subscriptions. */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const USER_ID = '1370317008167764019';

async function main() {
  const tests = [
    ['userId only', { userId: USER_ID }],
    ['userId + guildId:null', { userId: USER_ID, guildId: null }],
    ['guildId:null only (all users)', { guildId: null }],
    ['userId + status in [ACTIVE,TRIALING]', { userId: USER_ID, status: { in: ['ACTIVE', 'TRIALING'] } }],
    ['userId + status eq ACTIVE', { userId: USER_ID, status: 'ACTIVE' }],
    ['userId + plan PRO', { userId: USER_ID, plan: 'PRO' }],
    ['userId + plan ENTERPRISE', { userId: USER_ID, plan: 'ENTERPRISE' }],
  ];
  for (const [label, where] of tests) {
    console.log(`${label}: ${await prisma.subscription.count({ where })}`);
  }
  const raw = await prisma.$runCommandRaw({
    find: 'Subscription',
    filter: { userId: USER_ID },
    limit: 10,
  });
  for (const doc of raw.cursor.firstBatch) {
    console.log('RAW:', JSON.stringify(doc));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
