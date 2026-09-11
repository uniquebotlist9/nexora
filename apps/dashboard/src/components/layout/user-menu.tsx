'use client';

import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CreditCard, ExternalLink, KeyRound, LogOut, UserRound } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/dropdown';

interface UserMenuProps {
  name: string | null | undefined;
  image: string | null | undefined;
  email: string | null | undefined;
}

export function UserMenu({ name, image, email }: UserMenuProps) {
  const router = useRouter();
  const initials = (name ?? email ?? '?').slice(0, 1).toUpperCase();
  return (
    <DropdownMenu
      label="User menu"
      trigger={
        <span
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#5865F2] to-[#8B5CF6] text-sm font-bold text-white"
          aria-hidden="true"
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- Discord avatar, fixed size
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </span>
      }
      items={[
        {
          label: name ?? 'Signed in',
          icon: <UserRound className="h-4 w-4" />,
          onSelect: () => {},
          disabled: true,
        },
        {
          label: 'Profile & API keys',
          icon: <KeyRound className="h-4 w-4" />,
          onSelect: () => router.push('/dashboard/profile'),
        },
        {
          label: 'Billing',
          icon: <CreditCard className="h-4 w-4" />,
          onSelect: () => router.push('/dashboard/billing'),
        },
        {
          label: 'Open Discord profile',
          icon: <ExternalLink className="h-4 w-4" />,
          onSelect: () => window.open('https://discord.com/channels/@me', '_blank', 'noopener'),
        },
        {
          label: 'Sign out',
          icon: <LogOut className="h-4 w-4" />,
          variant: 'destructive' as const,
          onSelect: () => void signOut({ callbackUrl: '/' }),
        },
      ]}
    />
  );
}
