import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import SearchPage from '@/components/SearchPage';

export default async function Search() {
  const authed = await isAuthenticated();

  if (!authed) {
    redirect('/login');
  }

  return <SearchPage />;
}
