'use client';

import { useState, useEffect, useCallback } from 'react';

type ServiceStatus = 'checking' | 'connected' | 'disconnected';

export default function CrawlServiceStatus() {
  const [status, setStatus] = useState<ServiceStatus>('checking');
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/crawl', {
        method: 'GET',
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        setStatus(data.serviceAvailable ? 'connected' : 'disconnected');
      } else {
        setStatus('disconnected');
      }
    } catch {
      setStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    checkStatus();
    // Check every 30 seconds
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const copyCommand = (command: string, id: string) => {
    navigator.clipboard.writeText(command);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const statusColors = {
    checking: 'bg-yellow-400',
    connected: 'bg-green-500',
    disconnected: 'bg-gray-400',
  };

  const statusText = {
    checking: 'Checking...',
    connected: 'Crawl4AI Connected',
    disconnected: 'Crawl4AI Offline',
  };

  return (
    <>
      {/* Status Indicator Button */}
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
        title={statusText[status]}
      >
        <span className={`w-2 h-2 rounded-full ${statusColors[status]} ${status === 'checking' ? 'animate-pulse' : ''}`} />
        <span className="hidden lg:inline text-gray-600 dark:text-gray-300">
          {status === 'connected' ? 'Crawl4AI' : status === 'checking' ? '...' : 'Offline'}
        </span>
      </button>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setModalOpen(false)}
          />

          {/* Modal Content */}
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${statusColors[status]}`} />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Crawl4AI Service
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              {/* Status Banner */}
              <div className={`p-3 rounded-lg ${
                status === 'connected'
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700'
              }`}>
                <p className={`text-sm font-medium ${
                  status === 'connected'
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {status === 'connected' && (
                    <>
                      <span className="text-green-600 dark:text-green-400">Connected</span> - Extended review scraping and Reddit data are available.
                    </>
                  )}
                  {status === 'disconnected' && (
                    <>
                      <span className="text-gray-500">Offline</span> - The app works normally, but extended features are disabled.
                    </>
                  )}
                  {status === 'checking' && 'Checking connection...'}
                </p>
              </div>

              {/* What is Crawl4AI */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  What does Crawl4AI add?
                </h3>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">+</span>
                    <span><strong>Extended Reviews:</strong> Scrape thousands of reviews (vs ~500 from RSS)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">+</span>
                    <span><strong>Reddit Discussions:</strong> Real Reddit posts about apps/categories</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">+</span>
                    <span><strong>Website Analysis:</strong> Crawl competitor landing pages</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">+</span>
                    <span><strong>Enriched AI:</strong> All Claude prompts get richer data</span>
                  </li>
                </ul>
              </div>

              {status === 'disconnected' && (
                <>
                  <hr className="border-gray-200 dark:border-gray-700" />

                  {/* Setup Instructions */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                      How to Enable (One-Time Setup)
                    </h3>

                    {/* Prerequisites */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                        Prerequisites
                      </p>
                      <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                        <li>• Python 3.9+ installed</li>
                        <li>• pip (Python package manager)</li>
                      </ul>
                    </div>

                    {/* Step 1 */}
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                        Step 1: Install Dependencies (once)
                      </p>
                      <div className="relative">
                        <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto">
                          <code>cd crawl-service{'\n'}pip install -r requirements.txt{'\n'}playwright install chromium</code>
                        </pre>
                        <button
                          onClick={() => copyCommand('cd crawl-service && pip install -r requirements.txt && playwright install chromium', 'step1')}
                          className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                          title="Copy"
                        >
                          {copied === 'step1' ? (
                            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                        Step 2: Start the Service
                      </p>
                      <div className="relative">
                        <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto">
                          <code>cd crawl-service{'\n'}uvicorn main:app --host 0.0.0.0 --port 8000</code>
                        </pre>
                        <button
                          onClick={() => copyCommand('cd crawl-service && uvicorn main:app --host 0.0.0.0 --port 8000', 'step2')}
                          className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                          title="Copy"
                        >
                          {copied === 'step2' ? (
                            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Alternative: One Command */}
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-2">
                        Or use one command (after setup):
                      </p>
                      <div className="relative">
                        <pre className="bg-gray-900 text-gray-100 text-xs p-2 rounded overflow-x-auto">
                          <code>npm run dev:full</code>
                        </pre>
                        <button
                          onClick={() => copyCommand('npm run dev:full', 'devfull')}
                          className="absolute top-1 right-1 p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                          title="Copy"
                        >
                          {copied === 'devfull' ? (
                            <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Refresh Button */}
              <button
                onClick={() => {
                  setStatus('checking');
                  checkStatus();
                }}
                disabled={status === 'checking'}
                className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {status === 'checking' ? 'Checking...' : 'Refresh Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
