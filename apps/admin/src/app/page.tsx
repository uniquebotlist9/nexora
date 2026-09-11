import { redirect } from 'next/navigation';

/** Root of the staff console — everything lives under /admin. */
export default function RootPage() {
  redirect('/admin');
}
