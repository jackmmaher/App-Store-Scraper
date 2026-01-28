import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import ProjectsPage from '@/components/ProjectsPage';

export default async function Projects() {
  const authed = await isAuthenticated();

  if (!authed) {
    redirect('/login');
  }

  return <ProjectsPage />;
}
