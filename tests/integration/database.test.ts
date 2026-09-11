import net from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Database integration tests (require a reachable MongoDB replica set).
 *
 * Everything below is guarded: if the DATABASE_URL (root .env or process env)
 * does not point at a reachable TCP endpoint, the whole suite is skipped so
 * `npm run test` stays green on machines without MongoDB.
 *
 * The connection string uses the replica-set form because Prisma transactions
 * require a replica set / sharded cluster on MongoDB.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Load the root .env manually (vitest does not auto-load it) — the same file
// the dev services read. Process env always wins, mirroring dotenv semantics.
function loadRootEnv(): Record<string, string> {
  try {
    const raw = readFileSync(path.join(ROOT, '.env'), 'utf8');
    const env: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim().startsWith('#')) continue;
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[match[1]] = value;
    }
    return env;
  } catch {
    return {};
  }
}

const fileEnv = loadRootEnv();
const DATABASE_URL =
  process.env.DATABASE_URL ??
  fileEnv.DATABASE_URL ??
  'mongodb://localhost:27017/nexora?replicaSet=rs0';

// The Prisma client reads the connection string from process.env at
// instantiation time — make sure it is set even though vitest does not
// auto-load the root .env.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
}

function parseHostPort(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname || 'localhost', port: Number(parsed.port || 27017) };
  } catch {
    return { host: 'localhost', port: 27017 };
  }
}

function probeTcp(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

const { host, port } = parseHostPort(DATABASE_URL);
const mongoReachable = await probeTcp(host, port);

// Minimal structural type over the prisma singleton — only the pieces these
// tests touch. Imported lazily so a missing generated client never breaks
// collection on machines where the suite is skipped anyway.
type PrismaLike = {
  $runCommandRaw: (command: Record<string, unknown>) => Promise<unknown>;
  guild: {
    upsert: (args: unknown) => Promise<{ id: string; name: string }>;
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string } | null>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
  guildSettings: {
    upsert: (args: unknown) => Promise<{ guildId: string; prefix: string }>;
    deleteMany: (args: { where: { guildId: string } }) => Promise<number>;
  };
  channel: {
    create: (args: unknown) => Promise<{ id: string }>;
    deleteMany: (args: { where: { guildId: string } }) => Promise<number>;
  };
  role: {
    create: (args: unknown) => Promise<{ id: string }>;
    deleteMany: (args: { where: { guildId: string } }) => Promise<number>;
  };
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  $disconnect: () => Promise<void>;
};

async function importPrisma(): Promise<PrismaLike> {
  const mod = (await import('../../packages/database/src/index')) as { prisma: PrismaLike };
  return mod.prisma;
}

describe.skipIf(!mongoReachable)(
  `database integration (requires a reachable MongoDB at ${host}:${port})`,
  () => {
    let prisma: PrismaLike;
    const createdGuildIds: string[] = [];

    beforeAll(async () => {
      prisma = await importPrisma();
    });

    afterAll(async () => {
      if (!prisma) return;
      for (const guildId of createdGuildIds) {
        // Children (settings/channels/roles) cascade on guild delete.
        await prisma.guild.delete({ where: { id: guildId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    });

    it('connects and answers a ping', async () => {
      // MongoDB connector: $queryRaw is not supported, use $runCommandRaw.
      await expect(prisma.$runCommandRaw({ ping: 1 })).resolves.toEqual(
        expect.objectContaining({ ok: 1 }),
      );
    });

    it('stores and reads back a Guild with its GuildSettings', async () => {
      const guildId = `9998887776665550${String(Date.now()).slice(-5)}`;

      const guild = await prisma.guild.upsert({
        where: { id: guildId },
        create: { id: guildId, name: 'Nexora Test Guild', memberCount: 2 },
        update: { name: 'Nexora Test Guild (updated)' },
      });
      expect(guild.id).toBe(guildId);
      expect(guild.name).toBe('Nexora Test Guild');
      createdGuildIds.push(guildId);

      const settings = await prisma.guildSettings.upsert({
        where: { guildId },
        create: { guildId, prefix: '!' },
        update: { prefix: '?' },
      });
      expect(settings.guildId).toBe(guildId);
      expect(settings.prefix).toBe('!');

      // Upsert again — the update branch must win this time.
      const updated = await prisma.guildSettings.upsert({
        where: { guildId },
        create: { guildId, prefix: '!' },
        update: { prefix: '?' },
      });
      expect(updated.prefix).toBe('?');
    });

    it('commits multi-table writes atomically inside $transaction', async () => {
      const stamp = String(Date.now()).slice(-6);
      const guildId = `9998887776660000${stamp}`;
      const channelId = `8887776665550000${stamp}`;
      const roleId = `7776665554440000${stamp}`;

      await prisma.$transaction(async (tx) => {
        const t = tx as {
          guild: { create: (args: unknown) => Promise<{ id: string }> };
          channel: { create: (args: unknown) => Promise<{ id: string }> };
          role: { create: (args: unknown) => Promise<{ id: string }> };
        };
        await t.guild.create({
          data: { id: guildId, name: 'Nexora Tx Guild', memberCount: 1 },
        });
        await t.channel.create({
          data: { id: channelId, guildId, name: 'integration-test-channel' },
        });
        await t.role.create({
          data: { id: roleId, guildId, name: 'integration-test-role', position: 0 },
        });
      });
      createdGuildIds.push(guildId);

      const reloaded = await prisma.guild.findUnique({ where: { id: guildId } });
      expect(reloaded?.id).toBe(guildId);
    });

    it('rolls back the whole transaction when one write fails', async () => {
      const stamp = String(Date.now()).slice(-6);
      const guildId = `9998887776661111${stamp}`;
      const channelId = `8887776665551111${stamp}`;

      await expect(
        prisma.$transaction(async (tx) => {
          const t = tx as {
            guild: { create: (args: unknown) => Promise<{ id: string }> };
            channel: { create: (args: unknown) => Promise<{ id: string }> };
          };
          await t.guild.create({
            data: { id: guildId, name: 'Nexora Rollback Guild', memberCount: 1 },
          });
          // Same id twice → unique-constraint failure. The guild created above
          // must be rolled back together with this write.
          await t.channel.create({
            data: { id: channelId, guildId, name: 'rollback-test-channel' },
          });
          await t.channel.create({
            data: { id: channelId, guildId, name: 'rollback-test-channel-dup' },
          });
        }),
      ).rejects.toThrow();

      expect(await prisma.guild.findUnique({ where: { id: guildId } })).toBeNull();
    });
  },
);

describe.skipIf(mongoReachable)('database integration (skipped: no MongoDB)', () => {
  // Placeholder so the skip is visible and counted in the vitest report.
  it.skip('would run against a MongoDB replica set', () => {
    expect(true).toBe(true);
  });
});
