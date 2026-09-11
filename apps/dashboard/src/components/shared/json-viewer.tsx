import { cn } from '@nexora/ui';

/** Read-only JSON viewer with basic syntax coloring (no external deps). */
export function JsonViewer({ data, className }: { data: unknown; className?: string }) {
  let text: string;
  try {
    text = JSON.stringify(data, null, 2) ?? 'null';
  } catch {
    text = String(data);
  }
  return (
    <pre
      className={cn(
        'max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed scrollbar-thin',
        className,
      )}
    >
      {text}
    </pre>
  );
}
