import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { prisma } from '@nexora/database';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AccessDenied } from '@/components/shared/access-denied';
import { EmptyState } from '@/components/shared/empty-state';
import { AddStaffForm, StaffTable, type StaffRow } from '@/app/(panel)/admin/staff/staff-manager';
import { isAdminRole } from '@nexora/types';
import { formatDate, formatNumber } from '@/lib/format';
import { requirePage } from '@/lib/session';

export const metadata: Metadata = { title: 'Staff' };
export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const session = await requirePage('staff');
  if (!session) {
    return (
      <AccessDenied
        page="Staff"
        role={null}
      />
    );
  }

  const staff = await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
  const ownerCount = staff.filter((member) => member.role === 'OWNER').length;

  // Roles arrive as plain strings from MongoDB; rows with a corrupted role
  // value cannot be rendered by the role-typed table and are skipped.
  const rows: StaffRow[] = staff.flatMap((member) =>
    isAdminRole(member.role)
      ? [
          {
            id: member.id,
            userId: member.userId,
            role: member.role,
            createdAt: formatDate(member.createdAt),
          },
        ]
      : [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Staff</h2>
        <p className="text-sm text-muted-foreground">
          {formatNumber(staff.length)} staff member{staff.length === 1 ? '' : 's'} ·{' '}
          {formatNumber(ownerCount)} owner{ownerCount === 1 ? '' : 's'}. OWNER-only page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Add staff member
          </CardTitle>
          <CardDescription>
            Grant console access by Discord user ID. At least one OWNER must always remain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddStaffForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff members</CardTitle>
          <CardDescription>Role changes apply on the member&apos;s next request.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No staff members"
              description="Add the first staff member above (the initial OWNER is inserted manually via SQL / Prisma Studio)."
            />
          ) : (
            <StaffTable staff={rows} currentUserId={session.user.id} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
