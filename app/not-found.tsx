import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* 404 Icon */}
        <div className="mb-6">
          <div className="mx-auto w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <span className="text-4xl font-bold text-blue-600 dark:text-blue-400">404</span>
          </div>
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Page Not Found
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          The page you are looking for does not exist or has been moved.
        </p>

        {/* Suggestions */}
        <div className="mb-8 text-left bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Here are some helpful links:
          </p>
          <ul className="space-y-2">
            <li>
              <Link
                href="/search"
                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search App Store
              </Link>
            </li>
            <li>
              <Link
                href="/projects"
                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                My Projects
              </Link>
            </li>
            <li>
              <Link
                href="/keywords"
                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Keyword Research
              </Link>
            </li>
            <li>
              <Link
                href="/apps"
                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                Apps Database
              </Link>
            </li>
          </ul>
        </div>

        {/* Back Button */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
