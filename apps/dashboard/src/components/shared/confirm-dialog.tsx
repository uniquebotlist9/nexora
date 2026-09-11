'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, the user must type this exact phrase to unlock the confirm button. */
  typeToConfirm?: string;
  onConfirm: () => void;
}

/**
 * Confirmation dialog for destructive actions. Optionally requires the user
 * to type a phrase (e.g. the guild name) before confirming.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  typeToConfirm,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState('');
  const locked = Boolean(typeToConfirm) && typed !== typeToConfirm;

  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="space-y-4">
        {destructive && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>This action cannot be undone.</span>
          </div>
        )}
        {typeToConfirm && (
          <div className="space-y-1.5">
            <label htmlFor="confirm-typed" className="text-sm font-medium">
              Type <span className="font-mono text-destructive">{typeToConfirm}</span> to confirm
            </label>
            <input
              id="confirm-typed"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm focus-ring"
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={locked}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
