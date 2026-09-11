'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Shield } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { toggleRoleStaff } from './actions';

export interface RoleView {
  id: string;
  name: string;
  position: number;
  color: number;
  isStaff: boolean;
  reactionRoleUsage: number;
}

function roleColor(color: number): string {
  return color === 0 ? '#949ba4' : `#${color.toString(16).padStart(6, '0')}`;
}

export function RolesList({ guildId, roles }: { guildId: string; roles: RoleView[] }) {
  if (roles.length === 0) {
    return (
      <EmptyState
        icon={Shield}
        title="No roles synced yet"
        description="The bot syncs your server's roles on startup — give it a minute and refresh."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/60">
          {roles.map((role) => (
            <li key={role.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
                style={{ backgroundColor: roleColor(role.color) }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{role.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{role.id}</p>
              </div>
              {role.reactionRoleUsage > 0 && (
                <Badge variant="secondary">{role.reactionRoleUsage} role menu{role.reactionRoleUsage > 1 ? 's' : ''}</Badge>
              )}
              <div className="flex items-center gap-2">
                <label htmlFor={`staff-${role.id}`} className="text-xs text-muted-foreground">
                  Staff
                </label>
                <Switch
                  id={`staff-${role.id}`}
                  checked={role.isStaff}
                  onCheckedChange={async (isStaff) => {
                    const result = await toggleRoleStaff(guildId, role.id, isStaff);
                    if (!result.ok) toast.error(result.error);
                  }}
                  aria-label={`Mark ${role.name} as staff`}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
