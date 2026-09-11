'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { KeyRound, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { API_KEY_SCOPES, MAX_API_KEY_RATE_LIMIT } from '@/lib/api-keys';
import { createApiKey, revokeApiKey, type ApiKeyView, type CreatedApiKey } from './actions';

interface ApiKeysClientProps {
  initialKeys: ApiKeyView[];
  maxKeys: number;
  plan: string;
}

/**
 * Developer API keys: create (raw key shown exactly once), list and revoke.
 * Creating is plan-gated on the server; here we disable the button with a
 * reason when the user is at their key limit.
 */
export function ApiKeysClient({ initialKeys, maxKeys, plan }: ApiKeysClientProps) {
  const keys = initialKeys;
  const activeKeys = keys.filter((k) => !k.revokedAt);
  const atLimit = activeKeys.length >= maxKeys;

  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [scopes, setScopes] = React.useState<string[]>([]);
  const [rateLimit, setRateLimit] = React.useState('60');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<CreatedApiKey | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<ApiKeyView | null>(null);
  const [revoking, setRevoking] = React.useState(false);

  function openCreate() {
    setName('');
    setScopes([]);
    setRateLimit('60');
    setFieldErrors({});
    setCreated(null);
    setCreateOpen(true);
  }

  function submitCreate() {
    const parsedRate = Number.parseInt(rateLimit, 10);
    setCreating(true);
    void (async () => {
      const result = await createApiKey({
        name,
        scopes,
        rateLimitPerMinute: Number.isFinite(parsedRate) ? parsedRate : 60,
      });
      setCreating(false);
      if (result.ok && result.data) {
        setCreated(result.data);
        setFieldErrors({});
        toast.success(`API key "${result.data.key.name}" created.`);
      } else if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    })();
  }

  function confirmRevoke() {
    if (!revokeTarget || revoking) return;
    setRevoking(true);
    void (async () => {
      const result = await revokeApiKey(revokeTarget.id);
      setRevoking(false);
      if (result.ok) {
        toast.success(`API key "${revokeTarget.name}" revoked. Requests using it now fail with 401.`);
        setRevokeTarget(null);
      } else {
        toast.error(result.error);
      }
    })();
  }

  const createButton = (
    <Button variant="gradient" size="sm" onClick={openCreate} disabled={atLimit}>
      <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
      Create key
    </Button>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Developer API keys</CardTitle>
          <CardDescription>
            Authenticate REST API requests with <code className="font-mono text-xs">Authorization: Bearer nxk_…</code>.
            Active keys: {activeKeys.length}/{maxKeys} on the {plan} plan.
          </CardDescription>
        </div>
        {atLimit ? (
          <Tooltip content={`Limit reached (${maxKeys} keys on ${plan}) — revoke a key or upgrade your plan.`}>
            {createButton}
          </Tooltip>
        ) : (
          createButton
        )}
      </CardHeader>
      <CardContent className="p-0">
        {keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys yet"
            description="Create a key to use the Nexora REST API from your own tools. The key is shown exactly once."
            className="pb-8"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Rate limit</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell>
                      <code className="font-mono text-xs text-muted-foreground">{k.prefix}…</code>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <Badge key={s} variant="outline">
                            {s}
                          </Badge>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell>{k.rateLimitPerMinute}/min</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(k.createdAt), 'd MMM yyyy')}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {k.lastUsedAt ? format(new Date(k.lastUsedAt), 'd MMM yyyy') : 'Never'}
                    </TableCell>
                    <TableCell>
                      {k.revokedAt ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {k.revokedAt ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevokeTarget(k)}
                          aria-label={`Revoke key ${k.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreated(null);
        }}
        title={created ? 'Key created' : 'Create API key'}
        description={
          created
            ? undefined
            : 'Scopes are fixed at creation. The raw key is shown exactly once — store it somewhere safe.'
        }
      >
        {created ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                This is the only time the full key is shown. Only its SHA-256 hash is stored — if you
                lose it, revoke the key and create a new one.
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">{created.keyRaw}</code>
              <CopyButton text={created.keyRaw} label="Copy key" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                I&apos;ve stored it safely
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <FormField label="Name" htmlFor="apikey-name" required error={fieldErrors['name']}>
              <Input
                id="apikey-name"
                value={name}
                maxLength={100}
                placeholder="e.g. CI deploy script"
                onChange={(e) => setName(e.target.value)}
              />
            </FormField>
            <FormField label="Scopes" required error={fieldErrors['scopes']} hint="What the key is allowed to do.">
              <MultiSelect
                options={API_KEY_SCOPES}
                value={scopes}
                onChange={setScopes}
                placeholder="Pick at least one scope…"
              />
            </FormField>
            <FormField
              label="Rate limit (requests/minute)"
              htmlFor="apikey-ratelimit"
              error={fieldErrors['rateLimitPerMinute']}
              hint={`1–${MAX_API_KEY_RATE_LIMIT}. Applies per key on the API.`}
            >
              <Input
                id="apikey-ratelimit"
                type="number"
                min={1}
                max={MAX_API_KEY_RATE_LIMIT}
                value={rateLimit}
                onChange={(e) => setRateLimit(e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button
                onClick={submitCreate}
                loading={creating}
                disabled={creating || name.trim().length === 0 || scopes.length === 0}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Create key
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Revoke API key?"
        description={
          revokeTarget
            ? `"${revokeTarget.name}" (${revokeTarget.prefix}…) will stop working immediately. Any tool still using it will get 401 responses. This cannot be undone.`
            : ''
        }
        confirmLabel="Revoke key"
        destructive
        onConfirm={confirmRevoke}
      />
    </Card>
  );
}
