import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Header from '@/components/Header';
import KeywordResearch from '@/components/KeywordResearch';

interface Props {
  searchParams: Promise<{ q?: string; country?: string }>;
}

export default async function KeywordsPage({ searchParams }: Props) {
  const authed = await isAuthenticated();

  if (!authed) {
    redirect('/login');
  }

  const params = await searchParams;

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8 overflow-x-hidden">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Keyword Research</h1>
          <p className="text-gray-600 mt-1">
            Discover high-opportunity keywords with low competition and high search volume.
          </p>
        </div>
        <KeywordResearch initialQuery={params.q} initialCountry={params.country} />
      </main>
    </div>
  );
}
