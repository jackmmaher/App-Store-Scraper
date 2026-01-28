'use client';

import { useMemo } from 'react';
import { WireframeData } from '@/lib/supabase';
import {
  getComponentDefinition,
  ComponentType,
  getSystemImplications,
} from '@/lib/component-library';

interface SystemRequirementsProps {
  wireframeData: WireframeData;
}

interface RequirementGroup {
  category: string;
  requirements: string[];
  sourceComponents: string[];
}

export default function SystemRequirements({ wireframeData }: SystemRequirementsProps) {
  const requirements = useMemo(() => {
    const screens = Object.values(wireframeData.screens);
    if (screens.length === 0) return [];

    // Collect all component types and their sources
    const componentTypeMap = new Map<ComponentType, string[]>();

    screens.forEach((screen) => {
      screen.components.forEach((comp) => {
        const type = comp.type as ComponentType;
        if (!componentTypeMap.has(type)) {
          componentTypeMap.set(type, []);
        }
        componentTypeMap.get(type)!.push(`${screen.name} - ${comp.props.label || comp.props.title || type}`);
      });
    });

    // Get implications for all component types
    const allImplications = getSystemImplications(Array.from(componentTypeMap.keys()));

    // Group requirements by category
    const groups: RequirementGroup[] = [];

    // Camera/Media
    const mediaReqs = allImplications.filter(
      (imp) => imp.includes('camera') || imp.includes('permission')
    );
    if (mediaReqs.length > 0) {
      groups.push({
        category: 'Device Access',
        requirements: mediaReqs,
        sourceComponents: Array.from(componentTypeMap.entries())
          .filter(([type]) => {
            const def = getComponentDefinition(type);
            return def?.systemImplications?.some(
              (imp) => imp.includes('camera') || imp.includes('permission')
            );
          })
          .flatMap(([, sources]) => sources),
      });
    }

    // Backend/API
    const backendReqs = allImplications.filter(
      (imp) =>
        imp.includes('API') ||
        imp.includes('backend') ||
        imp.includes('database') ||
        imp.includes('storage')
    );
    if (backendReqs.length > 0) {
      groups.push({
        category: 'Backend Services',
        requirements: backendReqs,
        sourceComponents: Array.from(componentTypeMap.entries())
          .filter(([type]) => {
            const def = getComponentDefinition(type);
            return def?.systemImplications?.some(
              (imp) =>
                imp.includes('API') ||
                imp.includes('backend') ||
                imp.includes('database') ||
                imp.includes('storage')
            );
          })
          .flatMap(([, sources]) => sources),
      });
    }

    // Payments
    const paymentReqs = allImplications.filter(
      (imp) => imp.includes('payment') || imp.includes('subscription') || imp.includes('Stripe')
    );
    if (paymentReqs.length > 0) {
      groups.push({
        category: 'Payments',
        requirements: paymentReqs,
        sourceComponents: Array.from(componentTypeMap.entries())
          .filter(([type]) => {
            const def = getComponentDefinition(type);
            return def?.systemImplications?.some(
              (imp) =>
                imp.includes('payment') || imp.includes('subscription') || imp.includes('Stripe')
            );
          })
          .flatMap(([, sources]) => sources),
      });
    }

    // User Input/Forms
    const inputReqs = allImplications.filter(
      (imp) => imp.includes('input') || imp.includes('validation') || imp.includes('form')
    );
    if (inputReqs.length > 0) {
      groups.push({
        category: 'User Input',
        requirements: inputReqs,
        sourceComponents: Array.from(componentTypeMap.entries())
          .filter(([type]) => {
            const def = getComponentDefinition(type);
            return def?.systemImplications?.some(
              (imp) => imp.includes('input') || imp.includes('validation') || imp.includes('form')
            );
          })
          .flatMap(([, sources]) => sources),
      });
    }

    // Search
    const searchReqs = allImplications.filter((imp) => imp.includes('search') || imp.includes('filter'));
    if (searchReqs.length > 0) {
      groups.push({
        category: 'Search & Filter',
        requirements: searchReqs,
        sourceComponents: Array.from(componentTypeMap.entries())
          .filter(([type]) => {
            const def = getComponentDefinition(type);
            return def?.systemImplications?.some((imp) => imp.includes('search') || imp.includes('filter'));
          })
          .flatMap(([, sources]) => sources),
      });
    }

    // Settings
    const settingsReqs = allImplications.filter((imp) => imp.includes('setting') || imp.includes('preference'));
    if (settingsReqs.length > 0) {
      groups.push({
        category: 'User Settings',
        requirements: settingsReqs,
        sourceComponents: Array.from(componentTypeMap.entries())
          .filter(([type]) => {
            const def = getComponentDefinition(type);
            return def?.systemImplications?.some((imp) => imp.includes('setting') || imp.includes('preference'));
          })
          .flatMap(([, sources]) => sources),
      });
    }

    // Other
    const categorizedImps = new Set(
      [...mediaReqs, ...backendReqs, ...paymentReqs, ...inputReqs, ...searchReqs, ...settingsReqs]
    );
    const otherReqs = allImplications.filter((imp) => !categorizedImps.has(imp));
    if (otherReqs.length > 0) {
      groups.push({
        category: 'Other',
        requirements: otherReqs,
        sourceComponents: [],
      });
    }

    return groups;
  }, [wireframeData]);

  const screenCount = Object.keys(wireframeData.screens).length;
  const componentCount = Object.values(wireframeData.screens).reduce(
    (sum, screen) => sum + screen.components.length,
    0
  );

  if (screenCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <svg
          className="w-16 h-16 text-gray-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No wireframes yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md">
          Create wireframes to see auto-generated system requirements based on your components.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Screens</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{screenCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Components</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{componentCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">System Requirements</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {requirements.reduce((sum, g) => sum + g.requirements.length, 0)}
          </p>
        </div>
      </div>

      {/* Requirements by category */}
      {requirements.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
          <svg
            className="w-12 h-12 text-green-500 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-gray-900 dark:text-white font-medium">No special requirements detected</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Your current wireframe uses basic components only.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requirements.map((group) => (
            <div key={group.category} className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {group.category}
                </h3>
              </div>
              <div className="p-4">
                <ul className="space-y-2">
                  {group.requirements.map((req, i) => (
                    <li key={i} className="flex items-start">
                      <svg
                        className="w-5 h-5 text-amber-500 mr-2 mt-0.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-gray-700 dark:text-gray-300">{req}</span>
                    </li>
                  ))}
                </ul>
                {group.sourceComponents.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Source components:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {group.sourceComponents.slice(0, 5).map((source, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded"
                        >
                          {source}
                        </span>
                      ))}
                      {group.sourceComponents.length > 5 && (
                        <span className="px-2 py-0.5 text-gray-500 text-xs">
                          +{group.sourceComponents.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Data models suggestion */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">
          Suggested Data Models
        </h4>
        <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
          Based on your wireframes, consider these data models for your backend:
        </p>
        <pre className="bg-white dark:bg-gray-800 rounded p-3 text-xs overflow-x-auto text-gray-800 dark:text-gray-200">
{`// User model (if authentication needed)
interface User {
  id: string;
  email: string;
  created_at: Date;
}

// Add more models based on your specific app...`}
        </pre>
      </div>
    </div>
  );
}
