/**
 * Typed result for all server actions — never throw across the RSC boundary.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

export function err(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Convert a ZodError into a flat { field: message } map for inline display. */
export function zodFieldErrors(error: import('zod').ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}
