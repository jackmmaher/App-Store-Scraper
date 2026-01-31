'use client';

import { useState, useEffect, useCallback } from 'react';

type ServiceStatus = 'checking' | 'connected' | 'disconnected';
type StartStatus = 'idle' | 'starting' | 'success' | 'error';

function isRunningLocally(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.16.') ||
    host.startsWith('172.17.') ||
    host.startsWith('172.18.') ||
    host.startsWith('172.19.') ||
    host.startsWith('172.2') ||
    host.startsWith('172.3')
  );
}

export default function CrawlServiceStatus() {
  const [status, setStatus] = useState<ServiceStatus>('checking');
  const [modalOpen, setModalOpen] = useState(false);
  const [startStatus, setStartStatus] = useState<StartStatus>('idle');
  const [startError, setStartError] = useState<string | null>(null);
  const [showManualSetup, setShowManualSetup] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState(true);

  useEffect(() => {
    setIsLocal(isRunningLocally());
  }, []);

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
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const startCrawler = async () => {
    setStartStatus('starting');
    setStartError(null);

    try {
      const response = await fetch('/api/crawl/start', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setStartStatus('success');
        // Poll for connection
        let attempts = 0;
        const pollInterval = setInterval(async () => {
          attempts++;
          await checkStatus();
          if (status === 'connected' || attempts >= 10) {
            clearInterval(pollInterval);
            if (attempts >= 10 && status !== 'connected') {
              // Final check
              await checkStatus();
            }
          }
        }, 1000);
      } else {
        setStartStatus('error');
        setStartError(data.hint || data.error || 'Failed to start crawler');
      }
    } catch (err) {
      setStartStatus('error');
      setStartError('Network error - make sure the app is running locally');
    }
  };

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

                  {isLocal ? (
                    /* Local environment - show start button */
                    <div className="space-y-3">
                      <button
                        onClick={startCrawler}
                        disabled={startStatus === 'starting'}
                        className={`w-full py-3 px-4 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2 ${
                          startStatus === 'starting'
                            ? 'bg-blue-400 cursor-wait'
                            : startStatus === 'success'
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'bg-blue-500 hover:bg-blue-600'
                        }`}
                      >
                        {startStatus === 'starting' ? (
                          <>
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Starting Crawler...
                          </>
                        ) : startStatus === 'success' ? (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Started! Connecting...
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Start Crawler
                          </>
                        )}
                      </button>

                      {/* Error Message */}
                      {startStatus === 'error' && startError && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <p className="text-sm text-red-700 dark:text-red-300">{startError}</p>
                        </div>
                      )}

                      {/* First-time setup toggle */}
                      <button
                        onClick={() => setShowManualSetup(!showManualSetup)}
                        className="w-full text-left text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2"
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${showManualSetup ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        First-time setup (if button doesn&apos;t work)
                      </button>

                      {/* Collapsible Manual Setup */}
                      {showManualSetup && (
                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-4">
                          {/* Prerequisites */}
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                              Prerequisites
                            </p>
                            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                              <li>- Python 3.9+ installed</li>
                              <li>- pip (Python package manager)</li>
                            </ul>
                          </div>

                          {/* Install Command */}
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                              Install Dependencies (run once in terminal)
                            </p>
                            <div className="relative">
                              <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto">
                                <code>cd crawl-service &amp;&amp; pip install -r requirements.txt &amp;&amp; playwright install chromium</code>
                              </pre>
                              <button
                                onClick={() => copyCommand('cd crawl-service && pip install -r requirements.txt && playwright install chromium', 'install')}
                                className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                                title="Copy"
                              >
                                {copied === 'install' ? (
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

                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            After installing, try the &quot;Start Crawler&quot; button again.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Deployed environment - show local-only message */
                    <div className="space-y-4">
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex gap-3">
                          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                              Local Development Only
                            </p>
                            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                              The crawler runs on your computer, not on Vercel. Follow these steps to run locally:
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Step-by-step local setup */}
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                            1. Open PowerShell or Terminal
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Windows: Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Win + X</kbd> → select &quot;Terminal&quot; or &quot;PowerShell&quot;
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                            2. Navigate to your project folder
                          </p>
                          <div className="relative">
                            <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto">
                              <code>cd C:\Users\jackm\Projects\App-Store-Scraper</code>
                            </pre>
                            <button
                              onClick={() => copyCommand('cd C:\\Users\\jackm\\Projects\\App-Store-Scraper', 'cd')}
                              className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                              title="Copy"
                            >
                              {copied === 'cd' ? (
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

                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                            3. Start the app with crawler
                          </p>
                          <div className="relative">
                            <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto">
                              <code>npm run dev:full</code>
                            </pre>
                            <button
                              onClick={() => copyCommand('npm run dev:full', 'devfull')}
                              className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                              title="Copy"
                            >
                              {copied === 'devfull' ? (
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

                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                            4. Open in browser
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Go to <code className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">http://localhost:3000</code> — crawler will be connected.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Refresh Button */}
              <button
                onClick={() => {
                  setStatus('checking');
                  setStartStatus('idle');
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
