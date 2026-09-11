'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { BookOpen, KeyRound, Plus, Trash2, Webhook } from 'lucide-react';
import { WEBHOOK_EVENTS } from '@nexora/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormField } from '@/components/ui/form';
import { MultiSelect } from '@/components/ui/multi-select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { CopyButton } from '@/components/shared/copy-button';
import {
  createWebhookEndpoint, deleteWebhookEndpoint, createApiKey, revokeApiKey,
} from './actions';

export interface WebhookView {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  failureCount: number;
}

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  revoked: boolean;
  lastUsedAt: string | null;
}

export function IntegrationsView({
  guildId,
  webhooks,
  apiKeys,
  apiDocsUrl,
}: {
  guildId: string;
  webhooks: WebhookView[];
  apiKeys: ApiKeyView[];
  apiDocsUrl: string;
}) {
  const [creatingWebhook, setCreatingWebhook] = React.useState(false);
  const [creatingKey, setCreatingKey] = React.useState(false);
  const [deletingWebhook, setDeletingWebhook] = React.useState<WebhookView | null>(null);
  const [revealedSecret, setRevealedSecret] = React.useState<string | null>(null);
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Webhooks */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-4 w-4" aria-hidden="true" /> Webhook endpoints
            </CardTitle>
            <CardDescription>
              Signed HMAC deliveries for the events you subscribe to.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreatingWebhook(true)}>
            <Plus className="h-4 w-4" /> New endpoint
          </Button>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <EmptyState
              icon={Webhook}
              title="No webhook endpoints"
              description="Get member, moderation and ticket events pushed to your services in real time."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground" title={w.url}>
                      {w.url}
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[200px] flex-wrap gap-1">
                        {w.events.slice(0, 3).map((e) => (
                          <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>
                        ))}
                        {w.events.length > 3 && (
                          <Badge variant="outline" className="text-[10px]">+{w.events.length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          w.status === 'DELIVERED' ? 'success' : w.status === 'FAILED' ? 'destructive' : 'secondary'
                        }
                      >
                        {w.status.toLowerCase()}
                      </Badge>
                      {w.failureCount > 0 && (
                        <span className="ml-1 text-xs text-destructive">{w.failureCount} failures</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${w.name}`}
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingWebhook(w)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* API keys */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" aria-hidden="true" /> Developer API keys
            </CardTitle>
            <CardDescription>Keys authenticate against the public REST API.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreatingKey(true)}>
            <Plus className="h-4 w-4" /> New key
          </Button>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No API keys"
              description="Create a key to use the Nexora REST API from your own tools."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{k.prefix}…</TableCell>
                    <TableCell>
                      {k.scopes.length === 0 ? (
                        <span className="text-xs text-muted-foreground">all</span>
                      ) : (
                        k.scopes.join(', ')
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.revoked ? 'destructive' : 'success'}>
                        {k.revoked ? 'revoked' : 'active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!k.revoked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={async () => {
                            const result = await revokeApiKey(guildId, k.id);
                            if (result.ok) toast.success('Key revoked');
                            else toast.error(result.error);
                          }}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Event catalog */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" aria-hidden="true" /> Event catalog
          </CardTitle>
          <CardDescription>
            Every event Nexora can deliver to your endpoints. Full payload docs at{' '}
            <a href={apiDocsUrl} className="text-primary underline-offset-4 hover:underline">
              {apiDocsUrl}
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {WEBHOOK_EVENTS.map((event) => (
              <code key={event} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                {event}
              </code>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create webhook dialog */}
      <Dialog
        open={creatingWebhook}
        onOpenChange={setCreatingWebhook}
        title="New webhook endpoint"
        description="Deliveries are signed with an HMAC-SHA256 secret shown once."
      >
        <WebhookForm
          guildId={guildId}
          onCreated={(secret) => {
            setCreatingWebhook(false);
            setRevealedSecret(secret);
          }}
        />
      </Dialog>

      {/* Secret reveal (once) */}
      <Dialog
        open={revealedSecret !== null || revealedKey !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevealedSecret(null);
            setRevealedKey(null);
          }
        }}
        title={revealedSecret ? 'Webhook signing secret' : 'API key created'}
        description="Copy it now — for security it will never be shown again."
      >
        <div className="space-y-4">
          <code className="block break-all rounded-lg bg-muted p-3 font-mono text-sm">
            {revealedSecret ?? revealedKey}
          </code>
          <div className="flex items-center justify-between">
            <CopyButton text={revealedSecret ?? revealedKey ?? ''} />
            <Button
              onClick={() => {
                setRevealedSecret(null);
                setRevealedKey(null);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Create key dialog */}
      <Dialog
        open={creatingKey}
        onOpenChange={setCreatingKey}
        title="New API key"
        description="The key authenticates requests to the Nexora REST API."
      >
        <ApiKeyForm
          guildId={guildId}
          onCreated={(key) => {
            setCreatingKey(false);
            setRevealedKey(key);
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={deletingWebhook !== null}
        onOpenChange={(open) => !open && setDeletingWebhook(null)}
        title={`Delete "${deletingWebhook?.name}"?`}
        description="Your service will stop receiving events immediately."
        confirmLabel="Delete endpoint"
        destructive
        onConfirm={async () => {
          if (!deletingWebhook) return;
          const result = await deleteWebhookEndpoint(guildId, deletingWebhook.id);
          if (result.ok) toast.success('Endpoint deleted');
          else toast.error(result.error);
        }}
      />
    </div>
  );
}

function WebhookForm({
  guildId,
  onCreated,
}: {
  guildId: string;
  onCreated: (secret: string) => void;
}) {
  const [name, setName] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [events, setEvents] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  return (
    <div className="space-y-4">
      <FormField label="Name" htmlFor="wh-name" required>
        <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Billing service" maxLength={100} />
      </FormField>
      <FormField label="URL" htmlFor="wh-url" required hint="Must be a valid HTTPS URL.">
        <Input id="wh-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/nexora" />
      </FormField>
      <FormField label="Events" required>
        <MultiSelect
          options={WEBHOOK_EVENTS.map((e) => ({ value: e, label: e }))}
          value={events}
          onChange={setEvents}
          placeholder="Subscribe to events…"
        />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onCreated('')}>
          Cancel
        </Button>
        <Button
          loading={saving}
          disabled={!name.trim() || !url.startsWith('http') || events.length === 0}
          onClick={async () => {
            setSaving(true);
            const result = await createWebhookEndpoint(guildId, { name, url, events });
            setSaving(false);
            if (result.ok && result.data) onCreated(result.data.secret);
            else if (!result.ok) toast.error(result.error);
          }}
        >
          Create endpoint
        </Button>
      </div>
    </div>
  );
}

function ApiKeyForm({ guildId, onCreated }: { guildId: string; onCreated: (key: string) => void }) {
  const [name, setName] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  return (
    <div className="space-y-4">
      <FormField label="Key name" htmlFor="ak-name" required>
        <Input id="ak-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CI pipeline" maxLength={100} />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onCreated('')}>
          Cancel
        </Button>
        <Button
          loading={saving}
          disabled={!name.trim()}
          onClick={async () => {
            setSaving(true);
            const result = await createApiKey(guildId, { name, scopes: [] });
            setSaving(false);
            if (result.ok && result.data) onCreated(result.data.key);
            else if (!result.ok) toast.error(result.error);
          }}
        >
          Create key
        </Button>
      </div>
    </div>
  );
}
