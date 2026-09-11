'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { DatabaseBackup, Download, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { createBackup, deleteBackup, restoreBackup } from './actions';
import { formatBytes, relativeTime } from '@/lib/utils';

export interface BackupView {
  id: string;
  name: string;
  sizeBytes: number;
  checksum: string;
  scheduled: boolean;
  verified: boolean;
  createdAt: string;
}

export function BackupsView({
  guildId,
  backups,
  guildName,
  limit,
}: {
  guildId: string;
  backups: BackupView[];
  guildName: string;
  limit: number;
}) {
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<BackupView | null>(null);
  const [restoring, setRestoring] = React.useState<BackupView | null>(null);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{backups.length}</span> of {limit} stored
          backups (current plan)
        </p>
        <Button
          variant="gradient"
          size="sm"
          disabled={backups.length >= limit}
          onClick={async () => {
            setCreating(true);
            const result = await createBackup(guildId);
            setCreating(false);
            if (result.ok) toast.success('Backup queued — it will appear here when complete');
            else toast.error(result.error);
          }}
        >
          <Plus className="h-4 w-4" /> Create backup
        </Button>
      </div>

      {backups.length === 0 ? (
        <EmptyState
          icon={DatabaseBackup}
          title="No backups yet"
          description="Create a full configuration snapshot you can download or restore at any time."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Checksum</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead className="text-right">When</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      {b.name}
                      {b.scheduled && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          scheduled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{formatBytes(b.sizeBytes)}</TableCell>
                    <TableCell className="max-w-[120px] truncate font-mono text-[10px] text-muted-foreground" title={b.checksum}>
                      {b.checksum || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.verified ? 'success' : 'warning'}>
                        {b.verified ? 'verified' : 'pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{relativeTime(b.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <a
                          href={`/dashboard/g/${guildId}/backups/${b.id}/download`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-muted focus-ring"
                          aria-label={`Download ${b.name}`}
                          download
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Restore ${b.name}`}
                          onClick={() => setRestoring(b)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${b.name}`}
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleting(b)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This backup will be permanently removed. Download it first if you might need it."
        confirmLabel="Delete backup"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          const result = await deleteBackup(guildId, deleting.id);
          if (result.ok) toast.success('Backup deleted');
          else toast.error(result.error);
        }}
      />

      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(open) => !open && setRestoring(null)}
        title={`Restore "${restoring?.name}"?`}
        description={`This will overwrite the current configuration of ${guildName} with the snapshot from ${restoring ? relativeTime(restoring.createdAt) : ''}.`}
        confirmLabel="Restore backup"
        destructive
        typeToConfirm={guildName}
        onConfirm={async () => {
          if (!restoring) return;
          const result = await restoreBackup(guildId, restoring.id);
          if (result.ok) toast.success('Restore queued — the bot will apply it shortly');
          else toast.error(result.error);
        }}
      />
    </div>
  );
}
