import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import ConceptsPage from '@/components/ConceptsPage';

export default async function Concepts() {
  const authed = await isAuthenticated();
  if (!authed) redirect('/login');

  return <ConceptsPage />;
}
