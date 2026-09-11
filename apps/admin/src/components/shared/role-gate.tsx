import * as React from 'react';
import { hasRank, type AdminRole } from '@/lib/roles';

interface RoleGateProps {
  role: AdminRole | null | undefined;
  /** Minimum rank in the hierarchy (inclusive). */
  minRank?: AdminRole;
  /** Explicit allow-list alternative to `minRank` (non-linear gates). */
  roles?: readonly AdminRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Render-time role gate for mutating UI. Pure (no hooks) so it can be used in
 * server components; server actions re-check authorization regardless
 * (defense in depth — never rely on this gate alone).
 */
export function RoleGate({ role, minRank, roles, children, fallback = null }: RoleGateProps) {
  const allowed = roles
    ? role !== null && role !== undefined && roles.includes(role)
    : hasRank(role, minRank ?? 'OWNER');
  return <>{allowed ? children : fallback}</>;
}
