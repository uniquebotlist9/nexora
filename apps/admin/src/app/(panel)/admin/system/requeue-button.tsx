'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { requeueWebhookDeliveryAction } from '@/lib/actions/system';

export function RequeueDeliveryButton({
  deliveryId,
  event,
}: {
  deliveryId: string;
  event: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      const result = await requeueWebhookDeliveryAction(deliveryId);
      if (result.ok) {
        toast.success(result.message ?? 'Delivery requeued.');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RefreshCw />
        Requeue
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        loading={pending}
        title="Requeue this delivery?"
        description={
          <>
            Delivery for <code className="font-mono text-xs">{event}</code> will be reset to
            PENDING with no retry backoff, so the worker picks it up on the next pass.
          </>
        }
        confirmLabel="Requeue delivery"
        onConfirm={onConfirm}
      />
    </>
  );
}
