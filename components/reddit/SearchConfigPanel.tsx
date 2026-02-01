'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RedditSearchConfig } from '@/lib/reddit/types';

interface SearchConfigPanelProps {
  competitorId: string;
  competitorName: string;
  onAnalyze: (config: RedditSearchConfig) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  prefix?: string;
}

function TagInput({ tags, onChange, placeholder, prefix }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const newTag = inputValue.trim();
      if (!tags.includes(newTag)) {
        onChange([...tags, newTag]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 min-h-[42px]">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-md"
        >
          {prefix && <span className="text-blue-600 dark:text-blue-400">{prefix}</span>}
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="ml-1 hover:text-blue-600 dark:hover:text-blue-300"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] px-1 py-1 text-sm bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400"
      />
    </div>
  );
}

export default function SearchConfigPanel({
  competitorId,
  competitorName,
  onAnalyze,
  onCancel,
  isLoading = false,
}: SearchConfigPanelProps) {
  const [config, setConfig] = useState<RedditSearchConfig>({
    competitorId,
    problemDomain: '',
    searchTopics: [],
    subreddits: [],
    timeRange: 'month',
  });
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch config from API on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setIsLoadingConfig(true);
        setError(null);
        // BUG FIX: Use POST method as API only handles POST
        const response = await fetch('/api/reddit/generate-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ competitorId }),
        });
        if (!response.ok) {
          throw new Error('Failed to generate config');
        }
        const data = await response.json();
        // BUG FIX: Config is nested under data.config, not flat
        const configData = data.config || data;
        setConfig({
          competitorId,
          problemDomain: configData.problemDomain || '',
          searchTopics: configData.searchTopics || [],
          subreddits: configData.subreddits || [],
          timeRange: configData.timeRange || 'month',
        });
      } catch (err) {
        setError('Failed to load configuration. You can still enter details manually.');
        console.error('Error fetching config:', err);
      } finally {
        setIsLoadingConfig(false);
      }
    };

    fetchConfig();
  }, [competitorId]);

  const handleSubmit = useCallback(() => {
    onAnalyze(config);
  }, [config, onAnalyze]);

  const updateConfig = <K extends keyof RedditSearchConfig>(
    key: K,
    value: RedditSearchConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoadingConfig) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-6 w-6 text-blue-600 mr-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-gray-600 dark:text-gray-300">
            Generating search configuration for {competitorName}...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Reddit Deep Dive Configuration
      </h3>

      {error && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Problem Domain */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Problem Domain
          </label>
          <textarea
            value={config.problemDomain}
            onChange={(e) => updateConfig('problemDomain', e.target.value)}
            placeholder="Describe the problem space this app addresses..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Search Topics */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Search Topics
          </label>
          <TagInput
            tags={config.searchTopics}
            onChange={(tags) => updateConfig('searchTopics', tags)}
            placeholder="Type a topic and press Enter..."
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Keywords to search for in Reddit posts and comments
          </p>
        </div>

        {/* Subreddits */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Subreddits
          </label>
          <TagInput
            tags={config.subreddits}
            onChange={(tags) => updateConfig('subreddits', tags)}
            placeholder="Type a subreddit name and press Enter..."
            prefix="r/"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Target subreddits to analyze (without r/ prefix)
          </p>
        </div>

        {/* Time Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Time Range
          </label>
          <div className="flex gap-4">
            {[
              { value: 'week', label: 'Past Week' },
              { value: 'month', label: 'Past Month' },
              { value: 'year', label: 'Past Year' },
            ].map((option) => (
              <label
                key={option.value}
                className="flex items-center cursor-pointer"
              >
                <input
                  type="radio"
                  name="timeRange"
                  value={option.value}
                  checked={config.timeRange === option.value}
                  onChange={(e) => updateConfig('timeRange', e.target.value as 'week' | 'month' | 'year')}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isLoading || !config.problemDomain.trim() || config.searchTopics.length === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Run Reddit Deep Dive
            </>
          )}
        </button>
      </div>
    </div>
  );
}
