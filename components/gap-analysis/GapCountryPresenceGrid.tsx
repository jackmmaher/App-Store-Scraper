'use client';

import { COUNTRY_CODES } from '@/lib/constants';

interface Props {
  countries: string[];
  countriesPresent: string[];
  countryRanks: Record<string, number | null>;
  compact?: boolean;
}

export default function GapCountryPresenceGrid({
  countries,
  countriesPresent,
  countryRanks,
  compact = false,
}: Props) {
  if (compact) {
    // Compact mode: just show dots
    return (
      <div className="flex gap-0.5 flex-wrap">
        {countries.map((code) => {
          const isPresent = countriesPresent.includes(code);
          const rank = countryRanks[code];

          return (
            <span
              key={code}
              className={`w-2.5 h-2.5 rounded-full ${
                isPresent
                  ? rank && rank <= 3
                    ? 'bg-green-500'
                    : rank && rank <= 10
                    ? 'bg-blue-500'
                    : 'bg-gray-400'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
              title={
                isPresent
                  ? `${COUNTRY_CODES[code] || code}: #${rank || 'N/A'}`
                  : `${COUNTRY_CODES[code] || code}: Not present`
              }
            />
          );
        })}
      </div>
    );
  }

  // Full mode: show country codes with ranks
  return (
    <div className="flex gap-1 flex-wrap">
      {countries.map((code) => {
        const isPresent = countriesPresent.includes(code);
        const rank = countryRanks[code];

        return (
          <span
            key={code}
            className={`inline-flex items-center justify-center text-xs px-1.5 py-0.5 rounded ${
              isPresent
                ? rank && rank <= 3
                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                  : rank && rank <= 10
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600'
            }`}
            title={
              isPresent
                ? `${COUNTRY_CODES[code] || code}: Rank #${rank || 'N/A'}`
                : `${COUNTRY_CODES[code] || code}: Not present`
            }
          >
            {code.toUpperCase()}
            {isPresent && rank && (
              <span className="ml-0.5 font-medium">#{rank}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
