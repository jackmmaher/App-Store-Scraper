'use client';

import { useState, useEffect } from 'react';
import SearchConfigPanel from '@/components/reddit/SearchConfigPanel';
import UnmetNeedsPanel from '@/components/reddit/UnmetNeedsPanel';
import TrendsSentimentPanel from '@/components/reddit/TrendsSentimentPanel';
import RedditAnalysisProgress, { type RedditAnalysisStage, type RealTimeProgress } from '@/components/reddit/RedditAnalysisProgress';
import type { RedditSearchConfig, RedditAnalysisResult } from '@/lib/reddit/types';
import { useToast } from '@/components/ui/Toast';
import { getOperationErrorMessage } from '@/lib/errors';

interface RedditDeepDiveSectionProps {
  appId: string;
  appName: string;
  hasReviews: boolean;
}

/**
 * Reddit Deep Dive section for single app analysis (clone/tracking projects)
 */
export default function RedditDeepDiveSection({
  appId,
  appName,
  hasReviews,
}: RedditDeepDiveSectionProps) {
  const toast = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [analysis, setAnalysis] = useState<RedditAnalysisResult | null>(null);
  const [analysisStage, setAnalysisStage] = useState<RedditAnalysisStage>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isSavingSolutions, setIsSavingSolutions] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [realTimeProgress, setRealTimeProgress] = useState<RealTimeProgress | null>(null);
  const [pass2Warning, setPass2Warning] = useState<string | null>(null);

  // Load existing analysis on mount
  useEffect(() => {
    const loadExistingAnalysis = async () => {
      setIsLoadingExisting(true);
      try {
        const res = await fetch(`/api/reddit/analysis/${appId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.analysis) {
            setAnalysis(data.analysis);
            setIsExpanded(true);
          }
        }
      } catch (err) {
        console.error('Error loading existing Reddit analysis:', err);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    loadExistingAnalysis();
  }, [appId]);

  const handleAnalyze = async (config: RedditSearchConfig) => {
    setAnalysisStage('validating'); // Start with validating stage
    setAnalysisError(null);
    setShowConfig(false);
    setRealTimeProgress(null);
    setPass2Warning(null);

    try {
      // Use the streaming endpoint for real-time progress updates
      const response = await fetch('/api/reddit/analyze-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start Reddit analysis');
      }

      if (!response.body) {
        throw new Error('No response body from streaming endpoint');
      }

      // Process the SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedAnalysis = false;
      let lastError: string | null = null;
      let jsonParseErrorCount = 0;
      const MAX_JSON_PARSE_ERRORS = 5; // Allow some parse errors, but not too many

      try {
        while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            // Event type line - we handle data in the data: line
            continue;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              // Handle different event types
              if (data.stage) {
                // Stage change event - map backend stages to frontend stages
                const stageMap: Record<string, RedditAnalysisStage> = {
                  'validating': 'validating',
                  'crawling': 'crawling',
                  'analyzing': 'analyzing',
                  'storing': 'storing',
                };
                const mappedStage = stageMap[data.stage] || 'crawling';
                setAnalysisStage(mappedStage);

                // Update real-time progress with all available data
                setRealTimeProgress(prev => ({
                  ...prev,
                  stage: mappedStage,
                  progress: data.progress,
                  message: data.message,
                  // Validation data
                  validCount: data.validCount ?? prev?.validCount,
                  invalidCount: data.invalidCount ?? prev?.invalidCount,
                  discoveredCount: data.discoveredCount ?? prev?.discoveredCount,
                  invalid: data.invalid ?? prev?.invalid,
                  discovered: data.discovered ?? prev?.discovered,
                  // Crawling data
                  subredditsTotal: data.subredditsTotal ?? prev?.subredditsTotal,
                  postsFound: data.postsFound ?? prev?.postsFound,
                  commentsFound: data.commentsFound ?? prev?.commentsFound,
                  newPostsFromPass2: data.newPostsFromPass2 ?? prev?.newPostsFromPass2,
                  minedTerms: data.minedTerms ?? prev?.minedTerms,
                  // Analysis data
                  postsToAnalyze: data.postsToAnalyze ?? prev?.postsToAnalyze,
                  needsFound: data.needsFound ?? prev?.needsFound,
                  highSeverity: data.highSeverity ?? prev?.highSeverity,
                  languagePatterns: data.languagePatterns ?? prev?.languagePatterns,
                }));
              }

              // Handle Pass 2 warning (when Pass 2 fails but analysis continues)
              if (data.pass2Failed) {
                setPass2Warning('Language mining pass encountered an issue. Results may be less comprehensive.');
              }

              if (data.message === 'Analysis timed out. Try reducing search scope.' || data.isTimeout) {
                throw new Error('Reddit analysis timed out. Try reducing search scope.');
              }

              // Check for explicit error in the data
              if (data.error) {
                lastError = data.error;
                throw new Error(data.error);
              }

              // Handle completion
              if (data.analysis) {
                receivedAnalysis = true;
                setAnalysisStage('complete');
                setAnalysis(data.analysis);
                setIsExpanded(true);

                // Update final progress with summary
                if (data.summary) {
                  setRealTimeProgress(prev => ({
                    ...prev,
                    stage: 'complete',
                    progress: 100,
                    summary: data.summary,
                    analysisId: data.analysisId,
                  }));
                }

                // Reset stage after showing complete
                setTimeout(() => {
                  setAnalysisStage('idle');
                  setRealTimeProgress(null);
                }, 2000);
                return;
              }
            } catch (parseError) {
                // Track JSON parse errors - too many might indicate a problem
                if (parseError instanceof SyntaxError) {
                  jsonParseErrorCount++;
                  console.warn("JSON parse error in SSE stream:", line.slice(6, 100));

                  // If we get too many parse errors, something is wrong
                  if (jsonParseErrorCount >= MAX_JSON_PARSE_ERRORS) {
                    throw new Error("Failed to parse analysis data. The server response may be malformed.");
                  }
                  continue;
                }
                throw parseError;
              }
          }
        }
      }
      } finally {
        // Always close the reader to prevent resource leaks
        try {
          reader.releaseLock();
        } catch {
          // Ignore errors when releasing lock
        }
      }

      // If we finished the stream without receiving analysis, show an error
      if (!receivedAnalysis) {
        const errorMessage = lastError || "Analysis ended unexpectedly without results. Please try again.";
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Reddit analysis failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to run Reddit analysis';
      setAnalysisError(errorMessage);
      setAnalysisStage('error');
      setRealTimeProgress(null);

      // Show toast for immediate feedback
      toast.error(errorMessage);

      // Keep error displayed longer (5 seconds) before allowing retry
      setTimeout(() => {
        setAnalysisStage('idle');
        setShowConfig(true);
      }, 5000);
    }
  };

  const isAnalyzing = analysisStage !== 'idle' && analysisStage !== 'complete' && analysisStage !== 'error';

  const handleSolutionChange = (needId: string, notes: string) => {
    if (!analysis) return;

    setAnalysis({
      ...analysis,
      unmetNeeds: analysis.unmetNeeds.map(need =>
        need.id === needId ? { ...need, solutionNotes: notes } : need
      ),
    });
  };

  const handleSaveSolutions = async () => {
    if (!analysis) return;

    setIsSavingSolutions(true);
    try {
      const solutions = analysis.unmetNeeds
        .filter(need => need.solutionNotes)
        .map(need => ({
          needId: need.id,
          notes: need.solutionNotes || '',
        }));

      const response = await fetch('/api/reddit/solutions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId: analysis.id,
          solutions,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save solutions');
      }

      toast.success('Solutions saved successfully');
    } catch (error) {
      console.error('Error saving solutions:', error);
      toast.error(getOperationErrorMessage('save', error));
    } finally {
      setIsSavingSolutions(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
          </svg>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reddit Deep Dive</h2>
          {analysis && (
            <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
              Analysis Available
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!hasReviews ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Scrape reviews first to enable
            </span>
          ) : isLoadingExisting ? (
            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </span>
          ) : !analysis ? (
            <button
              onClick={() => setShowConfig(true)}
              className="px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Run Deep Dive
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowConfig(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Run New Analysis
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? '' : 'rotate-180'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && hasReviews && !isAnalyzing && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <SearchConfigPanel
            competitorId={appId}
            competitorName={appName}
            onAnalyze={handleAnalyze}
            onCancel={() => setShowConfig(false)}
            isLoading={isAnalyzing}
          />
        </div>
      )}

      {/* Progress Tracker - shows during analysis OR when there's an error */}
      {(isAnalyzing || analysisStage === 'error') && (
        <RedditAnalysisProgress
          stage={analysisStage}
          error={analysisError}
          realTimeData={realTimeProgress}
        />
      )}

      {/* Pass 2 Warning - shows if language mining failed but analysis completed */}
      {pass2Warning && analysis && !isAnalyzing && (
        <div className="mx-4 mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">{pass2Warning}</p>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && isExpanded && !isAnalyzing && (
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <UnmetNeedsPanel
              needs={analysis.unmetNeeds}
              onSolutionChange={handleSolutionChange}
              onSaveSolutions={handleSaveSolutions}
              isSaving={isSavingSolutions}
            />
            <TrendsSentimentPanel
              trends={analysis.trends}
              sentiment={analysis.sentiment}
              languagePatterns={analysis.languagePatterns}
              topSubreddits={analysis.topSubreddits}
            />
          </div>
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Analyzed {analysis.rawData.postsAnalyzed} posts and {analysis.rawData.commentsAnalyzed} comments
            {' '}from {analysis.rawData.dateRange.start.split('T')[0]} to {analysis.rawData.dateRange.end.split('T')[0]}
          </div>
        </div>
      )}

      {/* Empty state when no analysis and not showing config */}
      {!analysis && !showConfig && hasReviews && !isAnalyzing && analysisStage !== 'error' && (
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701z"/>
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
            Discover Unmet User Needs
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Analyze Reddit discussions to find what users are struggling with and opportunities for your app.
          </p>
          <button
            onClick={() => setShowConfig(true)}
            className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            Start Reddit Deep Dive
          </button>
        </div>
      )}

      {/* Disabled state when no reviews */}
      {!hasReviews && (
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Reviews Required
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Scrape app reviews first to generate intelligent Reddit search configuration.
          </p>
        </div>
      )}
    </div>
  );
}
