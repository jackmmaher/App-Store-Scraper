import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import ProjectDetailPage from '@/components/ProjectDetailPage';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetail({ params }: PageProps) {
  const authed = await isAuthenticated();

  if (!authed) {
    redirect('/login');
  }

  const { id } = await params;

  return <ProjectDetailPage projectId={id} />;
}
