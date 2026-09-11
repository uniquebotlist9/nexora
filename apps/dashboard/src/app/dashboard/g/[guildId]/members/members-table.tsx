'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { Users } from 'lucide-react';

export interface MemberRow {
  memberId: string;
  userId: string;
  isStaff: boolean;
  level: number | null;
  xp: number;
  messageCount: number;
  voiceMinutes: number;
  warnings: number;
  balance: number | null;
  tickets: number;
  joinedAt: string;
}

export function MembersTable({
  members,
  total,
  page,
  pageCount,
  guildId,
}: {
  members: MemberRow[];
  total: number;
  page: number;
  pageCount: number;
  guildId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [staffOnly, setStaffOnly] = React.useState(false);
  const [detail, setDetail] = React.useState<MemberRow | null>(null);
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  React.useEffect(() => {
    const params = new URLSearchParams();
    if (debounced) params.set('q', debounced);
    if (staffOnly) params.set('staff', '1');
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    router.replace(`/dashboard/g/${guildId}/members${qs ? `?${qs}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, staffOnly]);

  const onPageChange = (p: number) => {
    const params = new URLSearchParams();
    if (debounced) params.set('q', debounced);
    if (staffOnly) params.set('staff', '1');
    params.set('page', String(p));
    router.push(`/dashboard/g/${guildId}/members?${params.toString()}`);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by user ID…"
          aria-label="Search members"
          className="max-w-xs"
        />
        <Button variant={staffOnly ? 'default' : 'outline'} size="sm" onClick={() => setStaffOnly((v) => !v)}>
          Staff only
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">{total} members</span>
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title={query ? 'No matching members' : 'No members synced yet'}
          description={
            query
              ? 'Try a different search — the index only contains members the bot has seen.'
              : 'Members appear here once the bot sees them (message, join or voice activity).'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Warnings</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead className="text-right">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow
                    key={m.memberId}
                    className="cursor-pointer"
                    onClick={() => setDetail(m)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setDetail(m)}
                  >
                    <TableCell className="font-mono text-xs">{m.userId}</TableCell>
                    <TableCell className="text-sm">{m.level ?? '—'}</TableCell>
                    <TableCell className="text-sm">{m.messageCount}</TableCell>
                    <TableCell className="text-sm">{m.warnings}</TableCell>
                    <TableCell>
                      {m.isStaff ? <Badge variant="default">Staff</Badge> : null}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(m.joinedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} className="mt-4" />

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
        title="Member details"
        description={detail ? `Discord ID ${detail.userId}` : undefined}
      >
        {detail && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Level" value={detail.level != null ? String(detail.level) : '—'} />
            <Detail label="XP" value={String(detail.xp)} />
            <Detail label="Messages" value={String(detail.messageCount)} />
            <Detail label="Voice minutes" value={String(detail.voiceMinutes)} />
            <Detail label="Active warnings" value={String(detail.warnings)} />
            <Detail
              label="Economy balance"
              value={detail.balance != null ? String(detail.balance) : '—'}
            />
            <Detail label="Tickets opened" value={String(detail.tickets)} />
            <Detail label="Joined" value={new Date(detail.joinedAt).toLocaleString()} />
            <Detail label="Staff" value={detail.isStaff ? 'Yes' : 'No'} />
          </dl>
        )}
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}
