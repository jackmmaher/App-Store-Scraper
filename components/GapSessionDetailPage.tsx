'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useGapAnalysis } from '@/hooks/useGapAnalysis';
import { useGapChat } from '@/hooks/useGapChat';
import {
  GapScrapeProgress,
  GapResultsTable,
  GapAppDetailModal,
  GapMarketAnalysisPanel,
  GapChatPanel,
} from '@/components/gap-analysis';
import { CATEGORY_NAMES } from '@/lib/constants';
import type { GapAnalysisApp } from '@/lib/supabase';

interface Props {
  sessionId: string;
}

export default function GapSessionDetailPage({ sessionId }: Props) {
  const {
    currentSession,
    apps,
    loading,
    error,
    isScraping,
    scrapeProgress,
    isClassifying,
    isAnalyzing,
    analysisResult,
    loadSession,
    startScrape,
    runClassification,
    analyzeApp,
    clearError,
  } = useGapAnalysis({ sessionId });

  const {
    messages,
    isLoading: isChatLoading,
    sendMessage,
    clearConversation,
  } = useGapChat({ sessionId });

  const [selectedApp, setSelectedApp] = useState<GapAnalysisApp | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [analyzingAppId, setAnalyzingAppId] = useState<string | null>(null);

  // Note: loadSession is already called by useGapAnalysis hook when sessionId changes

  const handleStartScrape = async () => {
    await startScrape(sessionId);
  };

  const handleRunClassification = async () => {
    await runClassification(sessionId);
  };

  const handleAnalyzeApp = async (appStoreId: string) => {
    setAnalyzingAppId(appStoreId);
    // Keep modal open so user sees analysis is running, close after completion
    await analyzeApp(sessionId, appStoreId);
    setAnalyzingAppId(null);
    // Close modal after analysis completes so user can see results panel
    setSelectedApp(null);
  };

  if (loading && !currentSession) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!currentSession) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Session not found
          </h2>
          <Link
            href="/gap-analysis"
            className="mt-4 inline-block text-blue-600 hover:text-blue-700"
          >
            Back to Gap Analysis
          </Link>
        </div>
      </div>
    );
  }

  const canStartScrape = currentSession.scrape_status === 'pending' || currentSession.scrape_status === 'failed';
  const canClassify = currentSession.scrape_status === 'completed' && apps.length > 0;
  const hasClassifications = apps.some((a) => a.classification);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 overflow-x-hidden">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Link
                  href="/gap-analysis"
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {currentSession.name || 'Unnamed Analysis'}
                </h1>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    currentSession.scrape_status === 'completed'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : currentSession.scrape_status === 'in_progress'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      : currentSession.scrape_status === 'failed'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                  }`}
                >
                  {currentSession.scrape_status}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {CATEGORY_NAMES[currentSession.category] || currentSession.category}
                {' - '}
                {currentSession.countries.length} countries
                {apps.length > 0 && ` - ${apps.length} unique apps`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {canStartScrape && (
                <button
                  onClick={handleStartScrape}
                  disabled={isScraping}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
                >
                  {isScraping ? 'Scraping...' : 'Start Scrape'}
                </button>
              )}

              {canClassify && !hasClassifications && (
                <button
                  onClick={handleRunClassification}
                  disabled={isClassifying}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors disabled:opacity-50"
                >
                  {isClassifying ? 'Classifying...' : 'Classify Apps'}
                </button>
              )}

              {currentSession.scrape_status === 'completed' && (
                <button
                  onClick={() => setShowChat(!showChat)}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    showChat
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {showChat ? 'Hide Chat' : 'Chat'}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
            <span className="text-red-600 dark:text-red-400">{error}</span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 overflow-x-hidden">
        <div className={`grid gap-4 sm:gap-8 ${showChat ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
          {/* Main Content */}
          <div className={showChat ? 'lg:col-span-2' : ''}>
            {/* Scrape Progress */}
            {(isScraping || currentSession.scrape_status === 'in_progress') && (
              <div className="mb-8">
                <GapScrapeProgress
                  countries={currentSession.countries}
                  progress={scrapeProgress}
                  isActive={isScraping}
                />
              </div>
            )}

            {/* Pending State */}
            {currentSession.scrape_status === 'pending' && !isScraping && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Ready to Scrape
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  Click "Start Scrape" to begin collecting app data from{' '}
                  {currentSession.countries.length} countries.
                </p>
                <button
                  onClick={handleStartScrape}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  Start Scrape
                </button>
              </div>
            )}

            {/* Results */}
            {currentSession.scrape_status === 'completed' && apps.length > 0 && (
              <>
                {/* Results Table */}
                <div className="mb-8">
                  <GapResultsTable
                    apps={apps}
                    countries={currentSession.countries}
                    onSelectApp={setSelectedApp}
                    onAnalyzeApp={handleAnalyzeApp}
                    isAnalyzing={isAnalyzing}
                  />
                </div>

                {/* Market Analysis Panel */}
                <GapMarketAnalysisPanel
                  analysis={analysisResult}
                  isLoading={isAnalyzing}
                  appName={analyzingAppId ? apps.find((a) => a.app_store_id === analyzingAppId)?.app_name : undefined}
                />
              </>
            )}

            {/* Empty State */}
            {currentSession.scrape_status === 'completed' && apps.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  No Apps Found
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  The scrape completed but no apps were found. Try a different category.
                </p>
              </div>
            )}
          </div>

          {/* Chat Panel */}
          {showChat && (
            <div className="lg:col-span-1 h-[calc(100vh-200px)] sticky top-24">
              <GapChatPanel
                messages={messages}
                isLoading={isChatLoading}
                onSendMessage={sendMessage}
                onClearConversation={clearConversation}
              />
            </div>
          )}
        </div>
      </main>

      {/* App Detail Modal */}
      {selectedApp && (
        <GapAppDetailModal
          app={selectedApp}
          countries={currentSession.countries}
          onClose={() => setSelectedApp(null)}
          onAnalyze={() => handleAnalyzeApp(selectedApp.app_store_id)}
          isAnalyzing={isAnalyzing && analyzingAppId === selectedApp.app_store_id}
        />
      )}
    </div>
  );
}
