import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'app_store_scraper_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createSessionToken(): string {
  // Simple token generation - in production you might want something more robust
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION / 1000, // maxAge is in seconds
    path: '/',
  });
}

export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSessionCookie();
  return !!session;
}

export function verifyPassword(password: string): boolean {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    console.error('APP_PASSWORD environment variable not set');
    return false;
  }
  return password === appPassword;
}
