import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Header from '@/components/Header';
import AppIdeaFinder from '@/components/AppIdeaFinder';

export default async function AppIdeasPage() {
  const authed = await isAuthenticated();
  if (!authed) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <main>
        <AppIdeaFinder />
      </main>
    </div>
  );
}
