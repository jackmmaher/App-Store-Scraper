import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import GapSessionDetailPage from '@/components/GapSessionDetailPage';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GapSessionDetail({ params }: Props) {
  const authed = await isAuthenticated();

  if (!authed) {
    redirect('/login');
  }

  const { id } = await params;

  return <GapSessionDetailPage sessionId={id} />;
}
