/**
 * Discord permission bitfield constants and access helpers.
 *
 * Deliberately dependency-free (raw bigint bitfields from the Discord API)
 * so the dashboard and API can validate access without importing discord.js.
 */
export const PermissionBits = {
  CREATE_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  MENTION_EVERYONE: 1n << 17n,
  CONNECT: 1n << 20n,
  MUTE_MEMBERS: 1n << 22n,
  MOVE_MEMBERS: 1n << 24n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_NICKNAMES: 1n << 30n,
  MODERATE_MEMBERS: 1n << 40n,
} as const;

export type PermissionName = keyof typeof PermissionBits;

export function hasBit(permissions: bigint, bit: bigint): boolean {
  if ((permissions & PermissionBits.ADMINISTRATOR) === PermissionBits.ADMINISTRATOR) return true;
  return (permissions & bit) === bit;
}

/** Parse a permissions string from the Discord REST API (decimal string). */
export function parsePermissions(permissions: string | null | undefined): bigint {
  if (!permissions) return 0n;
  try {
    return BigInt(permissions);
  } catch {
    return 0n;
  }
}

export function canManageGuild(permissions: string | bigint | null | undefined): boolean {
  const bits = typeof permissions === 'bigint' ? permissions : parsePermissions(permissions);
  return hasBit(bits, PermissionBits.MANAGE_GUILD);
}

export function isGuildAdministrator(permissions: string | bigint | null | undefined): boolean {
  const bits = typeof permissions === 'bigint' ? permissions : parsePermissions(permissions);
  return hasBit(bits, PermissionBits.ADMINISTRATOR);
}

export function canKick(permissions: bigint): boolean {
  return hasBit(permissions, PermissionBits.KICK_MEMBERS);
}

export function canBan(permissions: bigint): boolean {
  return hasBit(permissions, PermissionBits.BAN_MEMBERS);
}

export function canTimeout(permissions: bigint): boolean {
  return hasBit(permissions, PermissionBits.MODERATE_MEMBERS);
}

export function canManageMessages(permissions: bigint): boolean {
  return hasBit(permissions, PermissionBits.MANAGE_MESSAGES);
}

export function canManageRoles(permissions: bigint): boolean {
  return hasBit(permissions, PermissionBits.MANAGE_ROLES);
}

/**
 * Validate role hierarchy: can `actor` act on `target`?
 * Discord IDs alone don't encode hierarchy — this compares the raw position
 * numbers provided by the gateway / REST API.
 */
export function canActOnMember(actorPosition: number, targetPosition: number, actorIsOwner: boolean): boolean {
  if (actorIsOwner) return true;
  return actorPosition > targetPosition;
}

/**
 * Can `actor` manage a role at `rolePosition`? The actor's highest role must
 * be strictly above the target role (and they need MANAGE_ROLES).
 */
export function canManageRoleAt(actorHighestPosition: number, rolePosition: number, actorIsOwner: boolean): boolean {
  if (actorIsOwner) return true;
  return actorHighestPosition > rolePosition;
}

/** Dashboard access levels, derived from Discord permissions. */
export type DashboardAccessLevel = 'none' | 'viewer' | 'manager' | 'admin';

export function dashboardAccessLevel(permissions: string | null | undefined): DashboardAccessLevel {
  const bits = parsePermissions(permissions);
  if (isGuildAdministrator(bits)) return 'admin';
  if (canManageGuild(bits)) return 'manager';
  return 'none';
}
