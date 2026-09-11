import * as React from 'react';

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, links). */
  actions?: React.ReactNode;
  className?: string;
}

/** Consistent page title block for admin pages. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={
        className ??
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'
      }
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
