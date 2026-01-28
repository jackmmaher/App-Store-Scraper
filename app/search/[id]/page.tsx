import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import SavedSearchView from '@/components/SavedSearchView';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SavedSearchPage({ params }: Props) {
  const authed = await isAuthenticated();

  if (!authed) {
    redirect('/login');
  }

  const { id } = await params;
  return <SavedSearchView searchId={id} />;
}
