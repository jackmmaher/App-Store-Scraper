import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Dashboard from '@/components/Dashboard';

export default async function HomePage() {
  const authed = await isAuthenticated();

  if (!authed) {
    redirect('/login');
  }

  return <Dashboard />;
}
