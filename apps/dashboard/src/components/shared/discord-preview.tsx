import type { EmbedData, MessagePayload } from '@nexora/types';
import { cn } from '@nexora/ui';
import { intToHex } from '@/lib/utils';

/**
 * Renders a MessagePayload the way Discord would: content above, embed below,
 * with accent bar, fields grid and footer. Pure presentational — safe in
 * client and server components.
 */
export function DiscordPreview({
  message,
  variables,
  username = 'Nexora',
  avatarUrl,
  className,
}: {
  message: MessagePayload | null | undefined;
  /** Sample data for {user}, {server}, ... placeholders. */
  variables?: Record<string, string>;
  username?: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  if (!message || (!message.content && !message.embed)) {
    return (
      <div className={cn('rounded-lg bg-[#313338] p-4 text-sm text-[#949ba4]', className)}>
        Nothing to preview yet — add a message or embed.
      </div>
    );
  }

  return (
    <div className={cn('space-y-3 rounded-lg bg-[#313338] p-4', className)}>
      <div className="flex gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5865F2] to-[#8B5CF6] text-sm font-bold text-white"
          aria-hidden="true"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Discord CDN, fixed size
            <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full" />
          ) : (
            'N'
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-white">{username}</span>
            <span className="rounded bg-[#5865F2] px-1 py-px text-[10px] font-semibold uppercase text-white">
              Bot
            </span>
          </div>
          {message.content && (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[#dbdee1]">
              {applyVariables(message.content, variables)}
            </p>
          )}
          {message.embed && <EmbedPreview embed={message.embed} variables={variables} />}
        </div>
      </div>
    </div>
  );
}

export function EmbedPreview({
  embed,
  variables,
}: {
  embed: EmbedData;
  variables?: Record<string, string>;
}) {
  const color = intToHex(embed.color);
  const fields = embed.fields ?? [];
  return (
    <div
      className="mt-2 max-w-md overflow-hidden rounded bg-[#2b2d31]"
      style={{ borderLeft: `4px solid ${color}` }}
      role="article"
      aria-label="Embed preview"
    >
      <div className="flex gap-3 p-3">
        <div className="min-w-0 flex-1 space-y-2">
          {embed.author && <p className="text-xs font-semibold text-white">{embed.author.name}</p>}
          {embed.title && (
            <p className="font-semibold text-white break-words">{applyVariables(embed.title, variables)}</p>
          )}
          {embed.description && (
            <p className="whitespace-pre-wrap break-words text-sm text-[#dbdee1]">
              {applyVariables(embed.description, variables)}
            </p>
          )}
          {fields.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {fields.map((f, i) => (
                <div key={i} className={cn('col-span-full', f.inline && 'col-span-1')}>
                  <p className="text-xs font-semibold text-white break-words">
                    {applyVariables(f.name, variables)}
                  </p>
                  <p className="text-xs text-[#dbdee1] break-words">
                    {applyVariables(f.value, variables)}
                  </p>
                </div>
              ))}
            </div>
          )}
          {embed.footer && <p className="text-[11px] text-[#949ba4]">{applyVariables(embed.footer.text, variables)}</p>}
          {embed.timestamp && (
            <p className="text-[11px] text-[#949ba4]">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          )}
        </div>
        {embed.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element -- external URL, fixed size
          <img src={embed.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
        )}
      </div>
      {embed.image && (
        // eslint-disable-next-line @next/next/no-img-element -- external URL
        <img src={embed.image} alt="" className="max-h-40 w-full object-cover" />
      )}
    </div>
  );
}

/** Replace {user}, {server}, ... placeholders with sample data. */
export function applyVariables(text: string, variables?: Record<string, string>): string {
  if (!variables) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => variables[key] ?? match);
}

/** Common variable cheat-sheet shown next to message builders. */
export const MESSAGE_VARIABLES: { name: string; description: string; sample: string }[] = [
  { name: '{user}', description: "Mentions the user", sample: '@NewMember' },
  { name: '{username}', description: "The user's display name", sample: 'NewMember' },
  { name: '{server}', description: 'Server name', sample: 'Nexora Community' },
  { name: '{memberCount}', description: 'Current member count', sample: '12,345' },
  { name: '{channel}', description: 'Channel name', sample: 'general' },
];
