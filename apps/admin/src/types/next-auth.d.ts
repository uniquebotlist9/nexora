import type { DefaultSession, DefaultUser } from 'next-auth';
import type { AdminRole } from '@nexora/types';

declare module 'next-auth' {
  interface Session {
    user: {
      /** Discord user id of the signed-in staff member. */
      id: string;
      /** Role from the AdminUser table; null when no longer staff. */
      adminRole: AdminRole | null;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    adminRole?: AdminRole | null;
  }
}
