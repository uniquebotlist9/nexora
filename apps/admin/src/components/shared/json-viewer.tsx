import * as React from 'react';

interface JsonViewerProps {
  value: unknown;
  className?: string;
  /** Max rendered length before truncation (0 = unlimited). */
  maxLength?: number;
}

/**
 * Read-only JSON pretty-printer for payloads / metadata blocks.
 * Server-safe (no hooks, no client JS).
 */
export function JsonViewer({ value, className, maxLength = 4000 }: JsonViewerProps) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    text = String(value);
  }
  if (maxLength > 0 && text.length > maxLength) {
    text = `${text.slice(0, maxLength)}\n… truncated`;
  }
  return (
    <pre
      className={
        className ??
        'max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground'
      }
    >
      {text}
    </pre>
  );
}
