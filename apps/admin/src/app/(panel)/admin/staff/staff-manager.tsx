'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { addStaffAction, changeStaffRoleAction, removeStaffAction } from '@/lib/actions/staff';
import { ADMIN_ROLE_VARIANT } from '@/lib/badges';
import { ADMIN_ROLES, type AdminRole } from '@/lib/roles';

export interface StaffRow {
  id: string;
  userId: string;
  role: AdminRole;
  createdAt: string;
}

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback(
    (invoke: () => Promise<{ ok: boolean; message?: string; error?: string }>, close: () => void) => {
      startTransition(async () => {
        const result = await invoke();
        if (result.ok) {
          toast.success(result.message ?? 'Done.');
          close();
          router.refresh();
        } else {
          toast.error(result.error ?? 'Action failed.');
        }
      });
    },
    [router],
  );
  return { pending, run };
}

export function AddStaffForm() {
  const [userId, setUserId] = React.useState('');
  const [role, setRole] = React.useState<AdminRole>('SUPPORT');
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useAction();

  const validId = /^\d{15,21}$/.test(userId.trim());

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Discord user ID</span>
          <Input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="e.g. 254715983592452096"
            inputMode="numeric"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Role</span>
          <Select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
            {ADMIN_ROLES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex items-end">
          <Button disabled={!validId} onClick={() => setOpen(true)}>
            <UserPlus />
            Add staff
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        loading={pending}
        title={`Add staff member as ${role}?`}
        description={
          <>
            Discord user <code className="font-mono text-xs">{userId.trim()}</code> will gain
            access to the staff console with the {role} role. This is audit-logged.
          </>
        }
        confirmLabel="Add staff member"
        onConfirm={() =>
          run(() => addStaffAction(userId.trim(), role), () => {
            setOpen(false);
            setUserId('');
          })
        }
      />
    </>
  );
}

export function StaffTable({
  staff,
  currentUserId,
}: {
  staff: StaffRow[];
  currentUserId: string;
}) {
  const [roleDrafts, setRoleDrafts] = React.useState<Record<string, AdminRole>>({});
  const [roleDialog, setRoleDialog] = React.useState<string | null>(null);
  const [removeDialog, setRemoveDialog] = React.useState<string | null>(null);
  const { pending, run } = useAction();

  const target = (id: string | null) => staff.find((member) => member.id === id) ?? null;
  const roleTarget = target(roleDialog);
  const removeTarget = target(removeDialog);

  return (
    <>
      <div className="space-y-2">
        {staff.map((member) => {
          const draftRole = roleDrafts[member.id] ?? member.role;
          const isSelf = member.userId === currentUserId;
          return (
            <div
              key={member.id}
              className="flex flex-wrap items-center gap-3 rounded-md border bg-background/40 px-3 py-2.5"
            >
              <span className="font-mono text-xs">{member.userId}</span>
              <Badge variant={ADMIN_ROLE_VARIANT[member.role]}>{member.role}</Badge>
              <span className="text-xs text-muted-foreground">
                added {member.createdAt}
                {isSelf ? ' · you' : ''}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <Select
                  className="h-8 w-[170px] text-xs"
                  value={draftRole}
                  onChange={(event) =>
                    setRoleDrafts((prev) => ({
                      ...prev,
                      [member.id]: event.target.value as AdminRole,
                    }))
                  }
                  aria-label={`Change role for ${member.userId}`}
                >
                  {ADMIN_ROLES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={draftRole === member.role}
                  onClick={() => setRoleDialog(member.id)}
                >
                  Change role
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isSelf}
                  title={isSelf ? 'You cannot remove your own account' : undefined}
                  onClick={() => setRemoveDialog(member.id)}
                >
                  <Trash2 />
                  Remove
                </Button>
              </span>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={roleTarget !== null}
        onOpenChange={() => setRoleDialog(null)}
        loading={pending}
        title={
          roleTarget
            ? `Change role to ${roleDrafts[roleTarget.id] ?? roleTarget.role}?`
            : 'Change role?'
        }
        description={
          roleTarget ? (
            <>
              Staff member <code className="font-mono text-xs">{roleTarget.userId}</code> will
              change from {roleTarget.role} to {roleDrafts[roleTarget.id] ?? roleTarget.role}.
              Their access updates on their next request. This is audit-logged.
            </>
          ) : null
        }
        confirmLabel="Change role"
        onConfirm={() => {
          if (!roleTarget) return;
          run(
            () => changeStaffRoleAction(roleTarget.id, roleDrafts[roleTarget.id] ?? roleTarget.role),
            () => setRoleDialog(null),
          );
        }}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={() => setRemoveDialog(null)}
        loading={pending}
        destructive
        title={removeTarget ? `Remove ${removeTarget.role} staff member?` : 'Remove staff member?'}
        description={
          removeTarget ? (
            <>
              Discord user <code className="font-mono text-xs">{removeTarget.userId}</code> will
              immediately lose access to the staff console. This is audit-logged.
            </>
          ) : null
        }
        confirmLabel="Remove staff member"
        onConfirm={() => {
          if (!removeTarget) return;
          run(() => removeStaffAction(removeTarget.id), () => setRemoveDialog(null));
        }}
      />
    </>
  );
}
