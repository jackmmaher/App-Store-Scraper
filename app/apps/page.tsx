import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Header from '@/components/Header';
import AppsDatabase from '@/components/AppsDatabase';

export default async function AppsPage() {
  const authed = await isAuthenticated();

  if (!authed) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8 overflow-x-hidden">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Apps Database</h1>
          <p className="text-gray-600 mt-1">
            All scraped apps in one place. Use filters to find specific apps.
          </p>
        </div>
        <AppsDatabase />
      </main>
    </div>
  );
}
