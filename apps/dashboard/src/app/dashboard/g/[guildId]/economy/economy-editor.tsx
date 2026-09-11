'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Coins, Plus, Save, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormField } from '@/components/ui/form';
import { EmptyState } from '@/components/shared/empty-state';
import { PlanGate } from '@/components/shared/plan-gate';
import type { GuildOption } from '@/components/shared/guild-selects';
import { RoleSelect } from '@/components/shared/guild-selects';
import {
  saveEconomyConfig, createShopItem, deleteShopItem, toggleShopItem,
  type EconomyConfigInput,
} from '@/app/dashboard/g/[guildId]/leveling/actions';

export interface ShopItemView {
  id: string;
  name: string;
  description: string;
  price: number;
  roleId: string | null;
  stock: number | null;
  enabled: boolean;
}

export function EconomyEditor({
  guildId,
  initial,
  roles,
  shopItems,
  economyUnlocked,
}: {
  guildId: string;
  initial: EconomyConfigInput;
  roles: GuildOption[];
  shopItems: ShopItemView[];
  economyUnlocked: boolean;
}) {
  const [state, setState] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const patch = (p: Partial<EconomyConfigInput>) => setState((s) => ({ ...s, ...p }));

  const save = async () => {
    setSaving(true);
    const result = await saveEconomyConfig(guildId, state);
    setSaving(false);
    if (result.ok) toast.success('Economy settings saved');
    else toast.error(result.error, { description: Object.values(result.fieldErrors ?? {})[0] });
  };

  return (
    <PlanGate locked={!economyUnlocked} feature="The economy system" requiredPlan="any premium tier" blur>
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Economy system</p>
              <p className="text-sm text-muted-foreground">Currency, dailies, work and crime mini-games.</p>
            </div>
            <Switch checked={state.enabled} onCheckedChange={(enabled) => patch({ enabled })} aria-label="Enable economy" />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Currency</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField label="Currency name" htmlFor="e-name">
                <Input id="e-name" value={state.currencyName} onChange={(e) => patch({ currencyName: e.target.value })} placeholder="coins" maxLength={32} />
              </FormField>
              <FormField label="Symbol" htmlFor="e-symbol">
                <Input id="e-symbol" value={state.currencySymbol} onChange={(e) => patch({ currencySymbol: e.target.value })} placeholder="🪙" maxLength={8} />
              </FormField>
              <FormField label="Daily amount" htmlFor="e-daily">
                <Input id="e-daily" type="number" min={0} value={state.dailyAmount} onChange={(e) => patch({ dailyAmount: Number(e.target.value) || 0 })} />
              </FormField>
              <FormField label="Weekly amount" htmlFor="e-weekly">
                <Input id="e-weekly" type="number" min={0} value={state.weeklyAmount} onChange={(e) => patch({ weeklyAmount: Number(e.target.value) || 0 })} />
              </FormField>
              <FormField label="Starting balance" htmlFor="e-start">
                <Input id="e-start" type="number" min={0} value={state.startingBalance} onChange={(e) => patch({ startingBalance: Number(e.target.value) || 0 })} />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Work &amp; crime</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField label="Work cooldown (min)" htmlFor="e-wcd">
                <Input id="e-wcd" type="number" min={1} value={state.workCooldownMinutes} onChange={(e) => patch({ workCooldownMinutes: Number(e.target.value) || 1 })} />
              </FormField>
              <FormField label="Work payout min" htmlFor="e-wmin">
                <Input id="e-wmin" type="number" min={0} value={state.workMin} onChange={(e) => patch({ workMin: Number(e.target.value) || 0 })} />
              </FormField>
              <FormField label="Work payout max" htmlFor="e-wmax">
                <Input id="e-wmax" type="number" min={0} value={state.workMax} onChange={(e) => patch({ workMax: Number(e.target.value) || 0 })} />
              </FormField>
              <FormField label="Crime cooldown (min)" htmlFor="e-ccd">
                <Input id="e-ccd" type="number" min={1} value={state.crimeCooldownMinutes} onChange={(e) => patch({ crimeCooldownMinutes: Number(e.target.value) || 1 })} />
              </FormField>
              <FormField label="Crime success rate (0–1)" htmlFor="e-crate">
                <Input
                  id="e-crate"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={state.crimeSuccessRate}
                  onChange={(e) => patch({ crimeSuccessRate: Number(e.target.value) || 0.5 })}
                />
              </FormField>
              <FormField label="Crime max fine" htmlFor="e-fine">
                <Input id="e-fine" type="number" min={0} value={state.crimeFineMax} onChange={(e) => patch({ crimeFineMax: Number(e.target.value) || 0 })} />
              </FormField>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>
            <Save className="h-4 w-4" /> Save settings
          </Button>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Shop items</CardTitle>
              <CardDescription>Items members can buy — optionally granting a role.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </CardHeader>
          <CardContent>
            {shopItems.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="The shop is empty"
                description="Add items members can purchase with their balance — role grants, limited stock, anything."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Role grant</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shopItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{item.name}</p>
                        {item.description && (
                          <p className="max-w-[240px] truncate text-xs text-muted-foreground">{item.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {state.currencySymbol}
                        {item.price}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.roleId ? (roles.find((r) => r.id === item.roleId)?.name ?? item.roleId) : '—'}
                      </TableCell>
                      <TableCell className="text-sm">{item.stock ?? '∞'}</TableCell>
                      <TableCell>
                        <Switch
                          checked={item.enabled}
                          onCheckedChange={async (enabled) => {
                            const result = await toggleShopItem(guildId, item.id, enabled);
                            if (!result.ok) toast.error(result.error);
                          }}
                          aria-label={`Toggle ${item.name}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${item.name}`}
                          className="text-destructive hover:bg-destructive/10"
                          onClick={async () => {
                            const result = await deleteShopItem(guildId, item.id);
                            if (result.ok) toast.success(`"${item.name}" deleted`);
                            else toast.error(result.error);
                          }}
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
      </div>

      <Dialog open={creating} onOpenChange={setCreating} title="New shop item" description="Members buy it with the /buy command.">
        <ShopItemForm
          guildId={guildId}
          roles={roles}
          currencySymbol={state.currencySymbol}
          onDone={() => setCreating(false)}
        />
      </Dialog>
    </PlanGate>
  );
}

function ShopItemForm({
  guildId,
  roles,
  currencySymbol,
  onDone,
}: {
  guildId: string;
  roles: GuildOption[];
  currencySymbol: string;
  onDone: () => void;
}) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [price, setPrice] = React.useState(100);
  const [roleId, setRoleId] = React.useState<string>();
  const [stock, setStock] = React.useState<string>('');
  const [saving, setSaving] = React.useState(false);

  return (
    <div className="space-y-4">
      <FormField label="Name" htmlFor="si-name" required>
        <Input id="si-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="VIP role" maxLength={100} />
      </FormField>
      <FormField label="Description" htmlFor="si-desc">
        <Textarea id="si-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Grants access to the VIP lounge" rows={2} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={`Price (${currencySymbol})`} htmlFor="si-price" required>
          <Input id="si-price" type="number" min={1} value={price} onChange={(e) => setPrice(Number(e.target.value) || 1)} />
        </FormField>
        <FormField label="Stock" htmlFor="si-stock" hint="Empty = unlimited.">
          <Input id="si-stock" type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} placeholder="∞" />
        </FormField>
      </div>
      <FormField label="Role granted on purchase" htmlFor="si-role">
        <RoleSelect id="si-role" roles={roles} value={roleId} onChange={setRoleId} placeholder="No role" />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button
          loading={saving}
          disabled={!name.trim()}
          onClick={async () => {
            setSaving(true);
            const result = await createShopItem(guildId, {
              name,
              description,
              price,
              roleId: roleId || undefined,
              stock: stock ? Number(stock) : undefined,
            });
            setSaving(false);
            if (result.ok) {
              toast.success('Shop item created');
              onDone();
            } else {
              toast.error(result.error);
            }
          }}
        >
          <Coins className="h-4 w-4" /> Create item
        </Button>
      </div>
    </div>
  );
}
