import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Header from '@/components/Header';
import OpportunityDashboard from '@/components/OpportunityDashboard';

export default async function OpportunitiesPage() {
  const authed = await isAuthenticated();

  if (!authed) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Header />
      <main className="overflow-x-hidden">
        <OpportunityDashboard />
      </main>
    </div>
  );
}
