import { describe, expect, it } from 'vitest';
import {
  PermissionBits,
  canActOnMember,
  canBan,
  canKick,
  canManageGuild,
  canManageMessages,
  canManageRoleAt,
  canManageRoles,
  canTimeout,
  dashboardAccessLevel,
  hasBit,
  isGuildAdministrator,
  parsePermissions,
} from '../../packages/permissions/src/index';

describe('PermissionBits', () => {
  it('exposes the documented Discord permission bit values', () => {
    expect(PermissionBits.CREATE_INVITE).toBe(1n << 0n);
    expect(PermissionBits.KICK_MEMBERS).toBe(1n << 1n);
    expect(PermissionBits.BAN_MEMBERS).toBe(1n << 2n);
    expect(PermissionBits.ADMINISTRATOR).toBe(1n << 3n);
    expect(PermissionBits.MANAGE_GUILD).toBe(1n << 5n);
    expect(PermissionBits.MANAGE_ROLES).toBe(1n << 28n);
    expect(PermissionBits.MODERATE_MEMBERS).toBe(1n << 40n);
  });
});

describe('hasBit', () => {
  it('returns true when the bit is set', () => {
    expect(hasBit(PermissionBits.SEND_MESSAGES, PermissionBits.SEND_MESSAGES)).toBe(true);
  });

  it('returns false when the bit is not set', () => {
    expect(hasBit(PermissionBits.SEND_MESSAGES, PermissionBits.BAN_MEMBERS)).toBe(false);
  });

  it('returns false for a zero bitfield', () => {
    expect(hasBit(0n, PermissionBits.ADMINISTRATOR)).toBe(false);
    expect(hasBit(0n, PermissionBits.MANAGE_MESSAGES)).toBe(false);
  });

  it('ADMINISTRATOR grants every other permission (override)', () => {
    const adminOnly = PermissionBits.ADMINISTRATOR;
    expect(hasBit(adminOnly, PermissionBits.BAN_MEMBERS)).toBe(true);
    expect(hasBit(adminOnly, PermissionBits.MANAGE_ROLES)).toBe(true);
    expect(hasBit(adminOnly, PermissionBits.MODERATE_MEMBERS)).toBe(true);
    expect(hasBit(adminOnly, PermissionBits.MANAGE_MESSAGES)).toBe(true);
  });

  it('handles combined bitfields', () => {
    const moderator =
      PermissionBits.KICK_MEMBERS | PermissionBits.BAN_MEMBERS | PermissionBits.MODERATE_MEMBERS;
    expect(hasBit(moderator, PermissionBits.KICK_MEMBERS)).toBe(true);
    expect(hasBit(moderator, PermissionBits.MODERATE_MEMBERS)).toBe(true);
    // ADMINISTRATOR is not implied by having several other permissions.
    expect(hasBit(moderator, PermissionBits.ADMINISTRATOR)).toBe(false);
    expect(hasBit(moderator, PermissionBits.MANAGE_GUILD)).toBe(false);
  });
});

describe('parsePermissions', () => {
  it('parses a decimal permissions string from the Discord REST API', () => {
    expect(parsePermissions('8')).toBe(PermissionBits.ADMINISTRATOR);
    expect(parsePermissions('1099511627776')).toBe(PermissionBits.MODERATE_MEMBERS);
  });

  it('round-trips combined bitfields through their decimal string form', () => {
    const bits =
      PermissionBits.KICK_MEMBERS | PermissionBits.BAN_MEMBERS | PermissionBits.MANAGE_MESSAGES;
    expect(parsePermissions(bits.toString())).toBe(bits);
  });

  it('returns 0n for null, undefined, empty or invalid input', () => {
    expect(parsePermissions(null)).toBe(0n);
    expect(parsePermissions(undefined)).toBe(0n);
    expect(parsePermissions('')).toBe(0n);
    expect(parsePermissions('not-a-number')).toBe(0n);
    expect(parsePermissions('8abc')).toBe(0n);
  });
});

describe('permission helpers', () => {
  const moderator =
    PermissionBits.KICK_MEMBERS |
    PermissionBits.BAN_MEMBERS |
    PermissionBits.MODERATE_MEMBERS |
    PermissionBits.MANAGE_MESSAGES |
    PermissionBits.MANAGE_ROLES;

  it('canKick / canBan / canTimeout / canManageMessages / canManageRoles detect the right bits', () => {
    expect(canKick(moderator)).toBe(true);
    expect(canBan(moderator)).toBe(true);
    expect(canTimeout(moderator)).toBe(true);
    expect(canManageMessages(moderator)).toBe(true);
    expect(canManageRoles(moderator)).toBe(true);
  });

  it('rejects when the required bit is missing', () => {
    const chatter = PermissionBits.SEND_MESSAGES | PermissionBits.VIEW_CHANNEL;
    expect(canKick(chatter)).toBe(false);
    expect(canBan(chatter)).toBe(false);
    expect(canTimeout(chatter)).toBe(false);
    expect(canManageMessages(chatter)).toBe(false);
    expect(canManageRoles(chatter)).toBe(false);
  });

  it('canManageGuild accepts decimal strings or bigints', () => {
    expect(canManageGuild(PermissionBits.MANAGE_GUILD.toString())).toBe(true);
    expect(canManageGuild(PermissionBits.MANAGE_GUILD)).toBe(true);
    expect(canManageGuild(PermissionBits.SEND_MESSAGES.toString())).toBe(false);
    // ADMINISTRATOR implies MANAGE_GUILD via hasBit's override.
    expect(canManageGuild('8')).toBe(true);
  });

  it('isGuildAdministrator only matches the ADMINISTRATOR bit', () => {
    expect(isGuildAdministrator('8')).toBe(true);
    expect(isGuildAdministrator(PermissionBits.ADMINISTRATOR)).toBe(true);
    expect(isGuildAdministrator('32')).toBe(false);
    expect(isGuildAdministrator('1099511627776')).toBe(false);
    expect(isGuildAdministrator(null)).toBe(false);
  });
});

describe('role hierarchy', () => {
  it('canActOnMember requires a strictly higher role position', () => {
    expect(canActOnMember(5, 3, false)).toBe(true); // actor above target
    expect(canActOnMember(3, 3, false)).toBe(false); // equal position → not allowed
    expect(canActOnMember(2, 5, false)).toBe(false); // actor below target
  });

  it('canActOnMember lets the server owner act on anyone', () => {
    expect(canActOnMember(1, 99, true)).toBe(true);
    expect(canActOnMember(99, 1, true)).toBe(true);
  });

  it('canManageRoleAt requires the actor’s highest role to be strictly above the role', () => {
    expect(canManageRoleAt(10, 5, false)).toBe(true);
    expect(canManageRoleAt(5, 5, false)).toBe(false); // equal position → not allowed
    expect(canManageRoleAt(1, 5, false)).toBe(false);
    expect(canManageRoleAt(1, 5, true)).toBe(true); // owner override
  });
});

describe('dashboardAccessLevel', () => {
  it('maps ADMINISTRATOR to admin', () => {
    expect(dashboardAccessLevel('8')).toBe('admin');
  });

  it('maps MANAGE_GUILD to manager', () => {
    expect(dashboardAccessLevel('32')).toBe('manager');
  });

  it('prefers admin when both ADMINISTRATOR and MANAGE_GUILD are set', () => {
    expect(dashboardAccessLevel((PermissionBits.ADMINISTRATOR | PermissionBits.MANAGE_GUILD).toString())).toBe(
      'admin',
    );
  });

  it('maps regular moderation permissions to none', () => {
    const moderator =
      PermissionBits.KICK_MEMBERS | PermissionBits.BAN_MEMBERS | PermissionBits.MODERATE_MEMBERS;
    expect(dashboardAccessLevel(moderator.toString())).toBe('none');
    expect(dashboardAccessLevel(PermissionBits.MODERATE_MEMBERS.toString())).toBe('none');
  });

  it('returns none for missing or invalid permissions', () => {
    expect(dashboardAccessLevel(null)).toBe('none');
    expect(dashboardAccessLevel(undefined)).toBe('none');
    expect(dashboardAccessLevel('')).toBe('none');
    expect(dashboardAccessLevel('garbage')).toBe('none');
  });
});
