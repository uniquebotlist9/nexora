'use client';

import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/select';

export interface GuildOption {
  id: string;
  name: string;
}

/** Single-select for a Discord channel (options loaded from guild data synced by the bot). */
export function ChannelSelect({
  channels,
  value,
  onChange,
  placeholder = 'Select a channel',
  id,
  disabled,
  onlyText,
  allowEmpty = true,
}: {
  channels: GuildOption[];
  value: string | null | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  /** Restrict to text-like channels (where the bot can send messages). */
  onlyText?: boolean;
  allowEmpty?: boolean;
}) {
  const options = (onlyText
    ? channels.filter((c) => !c.name.startsWith('[voice]') && !c.name.startsWith('[category]'))
    : channels
  ).map((c) => ({ value: c.id, label: `#${c.name}` }));

  return (
    <Select
      id={id}
      options={options}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={allowEmpty ? placeholder : undefined}
      disabled={disabled}
    />
  );
}

/** Single-select for a Discord role. */
export function RoleSelect({
  roles,
  value,
  onChange,
  placeholder = 'Select a role',
  id,
  disabled,
  allowEmpty = true,
}: {
  roles: GuildOption[];
  value: string | null | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  const options = roles.map((r) => ({ value: r.id, label: `@${r.name}` }));
  return (
    <Select
      id={id}
      options={options}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={allowEmpty ? placeholder : undefined}
      disabled={disabled}
    />
  );
}

/** Multi-select for Discord roles. */
export function RoleMultiSelect({
  roles,
  value,
  onChange,
  placeholder = 'Select roles…',
  id,
  disabled,
}: {
  roles: GuildOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <MultiSelect
      id={id}
      options={roles.map((r) => ({ value: r.id, label: `@${r.name}` }))}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      emptyLabel="No roles synced yet — the bot will sync them once it's online."
      disabled={disabled}
    />
  );
}

/** Multi-select for Discord channels. */
export function ChannelMultiSelect({
  channels,
  value,
  onChange,
  placeholder = 'Select channels…',
  id,
  disabled,
}: {
  channels: GuildOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <MultiSelect
      id={id}
      options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      emptyLabel="No channels synced yet — the bot will sync them once it's online."
      disabled={disabled}
    />
  );
}
