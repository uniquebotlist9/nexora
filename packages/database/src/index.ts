import { PrismaClient } from '@prisma/client';

// Re-export everything (models, enums, payload types) so consumers have a
// single import surface: `import { prisma, ModerationCase, CaseType } from '@nexora/database'`.
export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Singleton Prisma client. Prisma already pools connections internally;
 * the global binding prevents hot-reload (tsx watch / Next dev) from
 * opening a new pool on every reload and exhausting Postgres connections.
 */
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
