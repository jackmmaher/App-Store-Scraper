import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import GapAnalysisPage from '@/components/GapAnalysisPage';

export default async function GapAnalysis() {
  const authed = await isAuthenticated();

  if (!authed) {
    redirect('/login');
  }

  return <GapAnalysisPage />;
}
