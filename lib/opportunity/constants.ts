// Opportunity Ranker Constants

// ============================================================================
// Dimension Weights (must sum to 1.0)
// ============================================================================

export const DIMENSION_WEIGHTS = {
  competition_gap: 0.30,      // Doesn't matter how big market is if you can't win
  market_demand: 0.25,        // Must have search volume for organic acquisition
  revenue_potential: 0.20,    // Needs to be worth building
  trend_momentum: 0.15,       // Rising tide lifts all boats
  execution_feasibility: 0.10 // You can build anything with enough time
} as const;

// Validate weights sum to 1.0
const weightSum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.001) {
  throw new Error(`Dimension weights must sum to 1.0, got ${weightSum}`);
}

// ============================================================================
// Competition Gap Weights
// ============================================================================

export const COMPETITION_GAP_WEIGHTS = {
  title_keyword_saturation: 0.30,  // % of top 10 with keyword in title
  avg_review_count: 0.35,          // logarithmic scale, 1M+ = 100
  avg_rating_penalty: 0.20,        // 4.5+ rating = harder to beat
  feature_density: 0.15            // extracted from descriptions
} as const;

// ============================================================================
// Market Demand Weights
// ============================================================================

export const MARKET_DEMAND_WEIGHTS = {
  autosuggest_priority: 0.40,      // Apple's internal popularity signal
  google_trends_interest: 0.30,    // 0-100 from pytrends
  reddit_mention_velocity: 0.20,   // posts/week in relevant subreddits
  search_result_count: 0.10        // iTunes API total results
} as const;

// ============================================================================
// Revenue Potential Weights
// ============================================================================

export const REVENUE_POTENTIAL_WEIGHTS = {
  category_avg_price: 0.25,        // paid apps signal willingness to pay
  iap_presence_ratio: 0.35,        // % of top 10 with IAP
  subscription_presence: 0.25,     // recurring revenue indicator
  review_count_proxy: 0.15         // more reviews ≈ more downloads ≈ more $
} as const;

// ============================================================================
// Trend Momentum Weights
// ============================================================================

export const TREND_MOMENTUM_WEIGHTS = {
  google_trends_slope: 0.50,       // rising/falling over 12 months
  new_apps_launched_90d: 0.25,     // market activity indicator
  reddit_growth_rate: 0.25         // subreddit subscriber velocity
} as const;

// ============================================================================
// Execution Feasibility Weights
// ============================================================================

export const EXECUTION_FEASIBILITY_WEIGHTS = {
  avg_feature_count: 0.40,         // more features = harder MVP
  api_dependency: 0.30,            // external APIs = complexity
  hardware_requirement: 0.30       // camera/GPS/etc requirements
} as const;

// ============================================================================
// Scoring Thresholds
// ============================================================================

export const THRESHOLDS = {
  // Review count normalization (logarithmic scale)
  REVIEW_COUNT_MIN: 100,           // Below this = low competition
  REVIEW_COUNT_MID: 10000,         // Moderate competition
  REVIEW_COUNT_HIGH: 100000,       // High competition
  REVIEW_COUNT_MAX: 1000000,       // Maximum normalization point

  // Rating penalty thresholds
  RATING_PENALTY_START: 4.5,       // Ratings above this add difficulty
  RATING_PENALTY_MAX: 4.9,         // Maximum penalty point

  // Autosuggest priority normalization
  AUTOSUGGEST_PRIORITY_MAX: 20000, // Priority values above this = max demand

  // Search result normalization
  SEARCH_RESULTS_MAX: 200,         // iTunes API returns max 200

  // Feature count estimation
  FEATURE_COUNT_MIN: 3,            // Simple app
  FEATURE_COUNT_MID: 10,           // Medium complexity
  FEATURE_COUNT_MAX: 25,           // Complex app

  // Google Trends slope (12-month change)
  TRENDS_SLOPE_DECLINE: -0.2,      // Declining market
  TRENDS_SLOPE_STABLE: 0,          // Stable market
  TRENDS_SLOPE_GROWTH: 0.2,        // Growing market
  TRENDS_SLOPE_HOT: 0.5,           // Hot market

  // Reddit activity
  REDDIT_POSTS_LOW: 5,             // Per week
  REDDIT_POSTS_MID: 20,
  REDDIT_POSTS_HIGH: 50,

  // Opportunity score thresholds
  OPPORTUNITY_LOW: 40,             // Below this = not worth pursuing
  OPPORTUNITY_MEDIUM: 60,          // Moderate opportunity
  OPPORTUNITY_HIGH: 75,            // Good opportunity
  OPPORTUNITY_EXCELLENT: 85        // Excellent opportunity
} as const;

// ============================================================================
// Categories for Daily Crawl
// ============================================================================

export const DEFAULT_CRAWL_CATEGORIES = [
  'productivity',
  'utilities',
  'health-fitness',
  'finance',
  'education'
] as const;

export const ALL_CRAWL_CATEGORIES = [
  'productivity',
  'utilities',
  'health-fitness',
  'finance',
  'education',
  'lifestyle',
  'business',
  'photo-video',
  'entertainment',
  'food-drink',
  'travel',
  'weather',
  'navigation',
  'shopping',
  'social-networking'
] as const;

// ============================================================================
// Hardware Requirements Detection
// ============================================================================

export const HARDWARE_KEYWORDS = {
  camera: ['camera', 'photo', 'scan', 'ar ', 'augmented reality', 'barcode', 'qr code', 'face', 'selfie'],
  gps: ['location', 'gps', 'map', 'navigation', 'nearby', 'track', 'route', 'directions'],
  microphone: ['voice', 'speech', 'audio', 'recording', 'dictation', 'sound'],
  healthkit: ['health', 'fitness', 'workout', 'steps', 'heart rate', 'sleep'],
  nfc: ['nfc', 'contactless', 'tap to pay'],
  bluetooth: ['bluetooth', 'wireless', 'connect device'],
  accelerometer: ['motion', 'shake', 'tilt', 'pedometer', 'step counter']
} as const;

// ============================================================================
// Feature Keywords for Complexity Estimation
// ============================================================================

export const FEATURE_KEYWORDS = [
  // Authentication
  'sign in', 'login', 'account', 'profile', 'register', 'password',

  // Data & Sync
  'sync', 'cloud', 'backup', 'export', 'import', 'share',

  // Social
  'friends', 'social', 'community', 'chat', 'message', 'comment',

  // Monetization
  'premium', 'subscription', 'pro version', 'upgrade', 'in-app purchase',

  // Notifications
  'notifications', 'reminders', 'alerts', 'push',

  // UI Features
  'widget', 'watch', 'dark mode', 'themes', 'customiz',

  // Data Visualization
  'chart', 'graph', 'statistics', 'analytics', 'report',

  // AI/ML
  'ai', 'smart', 'automatic', 'intelligent', 'machine learning',

  // Integration
  'calendar', 'siri', 'shortcuts', 'integration', 'connect'
] as const;

// ============================================================================
// API Integration Keywords (External Dependencies)
// ============================================================================

export const API_DEPENDENCY_KEYWORDS = [
  // Payment
  'payment', 'stripe', 'paypal', 'credit card', 'checkout',

  // Social Auth
  'sign in with apple', 'google sign-in', 'facebook login',

  // Cloud Services
  'firebase', 'aws', 'azure', 'google cloud',

  // Third-party Data
  'weather api', 'news feed', 'stock', 'exchange rate', 'currency',

  // Maps
  'google maps', 'mapkit', 'mapbox',

  // AI Services
  'openai', 'chatgpt', 'claude', 'gpt',

  // Other APIs
  'api', 'webhook', 'endpoint', 'rest api'
] as const;

// ============================================================================
// Reddit Subreddits by Category
// ============================================================================

export const CATEGORY_SUBREDDITS: Record<string, string[]> = {
  'productivity': ['productivity', 'getdisciplined', 'gtd', 'bulletjournal', 'notion'],
  'utilities': ['iphone', 'ios', 'apple', 'shortcuts', 'automation'],
  'health-fitness': ['fitness', 'loseit', 'running', 'gym', 'nutrition', 'meditation'],
  'finance': ['personalfinance', 'investing', 'frugal', 'budgetfood', 'financialindependence'],
  'education': ['learnprogramming', 'languagelearning', 'education', 'studytips', 'GetStudying'],
  'lifestyle': ['minimalism', 'declutter', 'selfimprovement', 'habits'],
  'business': ['entrepreneur', 'smallbusiness', 'startups', 'business'],
  'photo-video': ['photography', 'videography', 'iPhoneography', 'photoediting'],
  'entertainment': ['movies', 'television', 'streaming', 'netflix'],
  'food-drink': ['cooking', 'recipes', 'mealprep', 'foodhacks'],
  'travel': ['travel', 'solotravel', 'backpacking', 'roadtrip'],
  'weather': ['weather', 'meteorology', 'tropicalweather'],
  'navigation': ['driving', 'roadtrip', 'commuting'],
  'shopping': ['deals', 'frugal', 'couponing', 'buyitforlife'],
  'social-networking': ['socialmedia', 'instagram', 'twitter', 'tiktok']
};

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONFIG = {
  KEYWORDS_PER_CATEGORY: 10,        // Reduced for faster discovery (was 50)
  KEYWORDS_PER_CATEGORY_DAILY: 25,  // More for daily cron (has 5 min timeout)
  TOP_OPPORTUNITIES_LIMIT: 20,
  RATE_LIMIT_MS: 200,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  GOOGLE_TRENDS_TIMEFRAME: 'today 12-m',
  REDDIT_LOOKBACK_DAYS: 30,
  DAILY_RUN_HOUR_UTC: 6
} as const;

// ============================================================================
// Score Color Mapping (for UI)
// ============================================================================

export const SCORE_COLORS = {
  excellent: { min: 85, color: 'emerald', label: 'Excellent' },
  high: { min: 75, color: 'green', label: 'High' },
  medium: { min: 60, color: 'yellow', label: 'Medium' },
  low: { min: 40, color: 'orange', label: 'Low' },
  poor: { min: 0, color: 'red', label: 'Poor' }
} as const;

export function getScoreColor(score: number): { color: string; label: string } {
  if (score >= SCORE_COLORS.excellent.min) return { color: SCORE_COLORS.excellent.color, label: SCORE_COLORS.excellent.label };
  if (score >= SCORE_COLORS.high.min) return { color: SCORE_COLORS.high.color, label: SCORE_COLORS.high.label };
  if (score >= SCORE_COLORS.medium.min) return { color: SCORE_COLORS.medium.color, label: SCORE_COLORS.medium.label };
  if (score >= SCORE_COLORS.low.min) return { color: SCORE_COLORS.low.color, label: SCORE_COLORS.low.label };
  return { color: SCORE_COLORS.poor.color, label: SCORE_COLORS.poor.label };
}
