/**
 * Error utilities for consistent error handling across the application
 */

export type ErrorCategory = 'network' | 'validation' | 'server' | 'auth' | 'notFound' | 'unknown';

export interface AppError {
  category: ErrorCategory;
  message: string;
  details?: string;
  originalError?: unknown;
}

/**
 * Common error messages mapped by category
 */
const ERROR_MESSAGES: Record<ErrorCategory, Record<string, string>> = {
  network: {
    default: 'Unable to connect to the server. Please check your internet connection.',
    timeout: 'The request timed out. Please try again.',
    offline: 'You appear to be offline. Please check your connection.',
  },
  validation: {
    default: 'Please check your input and try again.',
    required: 'Please fill in all required fields.',
    format: 'The input format is invalid.',
  },
  server: {
    default: 'Something went wrong on our end. Please try again later.',
    overloaded: 'The server is currently busy. Please try again in a moment.',
    maintenance: 'The service is under maintenance. Please try again later.',
  },
  auth: {
    default: 'You need to be logged in to perform this action.',
    expired: 'Your session has expired. Please log in again.',
    forbidden: 'You do not have permission to perform this action.',
  },
  notFound: {
    default: 'The requested resource was not found.',
    search: 'No results found for your search.',
    page: 'This page does not exist.',
  },
  unknown: {
    default: 'An unexpected error occurred. Please try again.',
  },
};

/**
 * Maps HTTP status codes to error categories
 */
function getErrorCategoryFromStatus(status: number): ErrorCategory {
  if (status === 0) return 'network';
  if (status === 401) return 'auth';
  if (status === 403) return 'auth';
  if (status === 404) return 'notFound';
  if (status === 422 || status === 400) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

/**
 * Categorizes an error and returns a user-friendly message
 */
export function categorizeError(error: unknown): AppError {
  // Handle fetch errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      category: 'network',
      message: ERROR_MESSAGES.network.default,
      originalError: error,
    };
  }

  // Handle Response objects from fetch
  if (error instanceof Response) {
    const category = getErrorCategoryFromStatus(error.status);
    return {
      category,
      message: ERROR_MESSAGES[category].default,
      details: `Status: ${error.status}`,
      originalError: error,
    };
  }

  // Handle Error objects with status codes
  if (error instanceof Error) {
    // Check for common error patterns
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return {
        category: 'network',
        message: ERROR_MESSAGES.network.default,
        originalError: error,
      };
    }

    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        category: 'network',
        message: ERROR_MESSAGES.network.timeout,
        originalError: error,
      };
    }

    if (message.includes('401') || message.includes('unauthorized')) {
      return {
        category: 'auth',
        message: ERROR_MESSAGES.auth.default,
        originalError: error,
      };
    }

    if (message.includes('403') || message.includes('forbidden')) {
      return {
        category: 'auth',
        message: ERROR_MESSAGES.auth.forbidden,
        originalError: error,
      };
    }

    if (message.includes('404') || message.includes('not found')) {
      return {
        category: 'notFound',
        message: ERROR_MESSAGES.notFound.default,
        originalError: error,
      };
    }

    if (message.includes('500') || message.includes('server error')) {
      return {
        category: 'server',
        message: ERROR_MESSAGES.server.default,
        originalError: error,
      };
    }

    // Return the original message if it looks user-friendly
    if (error.message && error.message.length < 100 && !error.message.includes('Error:')) {
      return {
        category: 'unknown',
        message: error.message,
        originalError: error,
      };
    }
  }

  // Default unknown error
  return {
    category: 'unknown',
    message: ERROR_MESSAGES.unknown.default,
    originalError: error,
  };
}

/**
 * Gets a user-friendly error message from any error
 */
export function getErrorMessage(error: unknown, fallback?: string): string {
  const appError = categorizeError(error);
  return appError.message || fallback || ERROR_MESSAGES.unknown.default;
}

/**
 * Gets a user-friendly error message for specific operations
 */
export function getOperationErrorMessage(operation: string, error?: unknown): string {
  const baseMessages: Record<string, string> = {
    save: 'Failed to save. Please try again.',
    delete: 'Failed to delete. Please try again.',
    load: 'Failed to load data. Please refresh the page.',
    send: 'Failed to send. Please try again.',
    search: 'Search failed. Please try again.',
    export: 'Export failed. Please try again.',
    upload: 'Upload failed. Please try again.',
    analyze: 'Analysis failed. Please try again.',
    scrape: 'Scraping failed. Please try again.',
  };

  // If we have a specific error, try to categorize it
  if (error) {
    const appError = categorizeError(error);
    if (appError.category === 'network') {
      return `${baseMessages[operation] || 'Operation failed.'} Check your internet connection.`;
    }
    if (appError.category === 'auth') {
      return 'Please log in and try again.';
    }
  }

  return baseMessages[operation] || 'An error occurred. Please try again.';
}

/**
 * Creates an error for validation failures
 */
export function createValidationError(field: string, message?: string): AppError {
  return {
    category: 'validation',
    message: message || `Please provide a valid ${field}.`,
  };
}

/**
 * Checks if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  return categorizeError(error).category === 'network';
}

/**
 * Checks if an error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  return categorizeError(error).category === 'auth';
}
