import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import ConceptDetailPage from '@/components/ConceptDetailPage';

export default async function ConceptDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const authed = await isAuthenticated();
  if (!authed) redirect('/login');

  const { id } = await params;
  return <ConceptDetailPage conceptId={id} />;
}
