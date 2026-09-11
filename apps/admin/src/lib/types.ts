/** Shared result shape returned by all server actions. */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };
