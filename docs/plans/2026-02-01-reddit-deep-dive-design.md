# Reddit Deep Dive Feature Design

## Overview

Integrate Reddit semantic analysis into the competitor analysis pipeline to surface **problem-domain insights** that app store reviews miss.

**The insight:** App store reviews capture post-download frustrations (UX, pricing, bugs). Reddit captures pre-download problem exploration (the actual human struggle people are trying to solve). Combining both creates a holistic picture for blueprint strategy.

## User Flow

```
1. User adds competitor app to project (existing)
2. User scrapes App Store reviews (existing)
3. [NEW] "Reddit Deep Dive" button appears on competitor card
4. User clicks → config panel with pre-populated search terms
5. User refines terms if needed → triggers search
6. Results display: Unmet Needs + Trends/Sentiment
7. User annotates each unmet need with solution approach
8. "Analyze" combines reviews + Reddit + annotations
9. Blueprint strategy uses all inputs
```

## Component 1: Search Configuration Panel

Triggered by "Reddit Deep Dive" button on competitor card (after reviews scraped).

### Auto-Generation Logic

1. Parse app name and description for problem-domain keywords
2. Run quick Claude pass on sampled reviews: "What problem is the user trying to solve?"
3. Map app category to known subreddits (extend existing `CATEGORY_SUBREDDITS`)
4. Use Reddit subreddit search API to discover additional relevant communities

### UI Elements

- **Problem Domain** (editable text): Auto-derived summary, e.g., "Vaping cessation, nicotine addiction recovery"
- **Search Topics** (tag input): Pre-populated keywords, user can remove or add
- **Subreddits** (tag input): Pre-populated from category mapping + discovery, user can add
- **Time Range** (radio): Past Week / Past Month / Past Year
- **Actions**: Cancel, Run Reddit Deep Dive

### Data Model

```typescript
interface RedditSearchConfig {
  competitorId: string;
  problemDomain: string;
  searchTopics: string[];
  subreddits: string[];
  timeRange: 'week' | 'month' | 'year';
}
```

## Component 2: Reddit Scraping & Analysis

### Scraping Strategy

Use existing Reddit JSON API infrastructure (`/crawl-service/crawlers/reddit.py`):

1. For each subreddit + topic combination:
   - Search posts: `reddit.com/r/{sub}/search.json?q={topic}&limit=100&t={range}`
   - Fetch top comments on high-engagement posts (>20 upvotes)
2. Rate limiting: 1-2 second delays between requests
3. Deduplicate posts by ID across searches

### AI Semantic Analysis

Send collected posts + comments to Claude for extraction:

**Prompt objectives:**
1. Identify top unmet needs (problems people repeatedly mention lacking solutions for)
2. Categorize by severity (High/Medium/Low) based on frequency + emotional intensity
3. Extract evidence: post count, engagement metrics, representative quotes
4. Analyze sentiment breakdown (frustrated, seeking help, success stories)
5. Identify language patterns ("I wish there was...", "Has anyone tried...")
6. Calculate trend direction (comparing recent vs older posts)

**Output structure:**

```typescript
interface RedditAnalysisResult {
  unmetNeeds: UnmetNeed[];
  trends: TrendAnalysis;
  sentiment: SentimentBreakdown;
  languagePatterns: string[];
  topSubreddits: SubredditSummary[];
  rawData: {
    postsAnalyzed: number;
    commentsAnalyzed: number;
    dateRange: { start: Date; end: Date };
  };
}

interface UnmetNeed {
  id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  evidence: {
    postCount: number;
    avgUpvotes: number;
    topSubreddits: string[];
    representativeQuotes: string[];
  };
  solutionNotes: string | null; // User annotation
}

interface TrendAnalysis {
  discussionVolume: number; // posts per month
  trendDirection: 'rising' | 'stable' | 'declining';
  percentChange: number; // vs 3 months ago
}

interface SentimentBreakdown {
  frustrated: number; // percentage
  seekingHelp: number;
  successStories: number;
}
```

## Component 3: Results Display

Two-column layout on competitor detail page:

### Left Column: Top Unmet Needs

Each need displayed as expandable card:
- Title + severity badge
- Description (1-2 sentences)
- Evidence line: "127 posts • Avg 84 upvotes • r/QuitVaping"
- **Solution Notes** textarea (user annotation)
- Expand to see representative quotes

### Right Column: Trends & Sentiment

- Discussion volume bar + number
- Trend direction arrow + percentage
- Sentiment breakdown (horizontal stacked bar)
- Common language patterns (quoted phrases)
- Top subreddits by engagement

## Component 4: Enhanced AI Analysis

Modify existing analysis endpoint to accept Reddit data.

### Input Combination

```typescript
interface EnhancedAnalysisInput {
  // Existing
  reviews: {
    negative: Review[];
    neutral: Review[];
    positive: Review[];
  };
  appMetadata: AppMetadata;

  // New
  redditAnalysis: RedditAnalysisResult | null;
  userSolutionNotes: { needId: string; notes: string }[];
}
```

### Enhanced Prompt Structure

```
COMPETITOR APP: {name}
Category: {category}

=== APP STORE INSIGHTS ===
(What users of THIS app complain about)

{existing review analysis sections}

=== REDDIT MARKET INSIGHTS ===
(What the BROADER market needs - beyond this app's users)

Unmet Needs Identified:
{for each unmet need}
- {title} [Severity: {severity}]
  Problem: {description}
  Evidence: {postCount} posts, {avgUpvotes} avg upvotes
  User's Solution Approach: {solutionNotes or "Not yet defined"}
{end for}

Market Signals:
- Discussion volume: {volume} posts/month
- Trend: {direction} ({percentChange}% vs 3 months ago)
- Sentiment: {frustrated}% frustrated, {seekingHelp}% seeking help
- Top communities: {subreddits}

=== ANALYSIS INSTRUCTIONS ===
Generate competitive intelligence that:
1. Identifies what this app does well (to learn from)
2. Identifies app-level weaknesses (from reviews)
3. Identifies problem-domain gaps (from Reddit) with user's proposed solutions
4. Creates strategic positioning based on solving what competitors miss
```

### Output Enhancement

Add new section to `CompetitorAnalysis`:

```typescript
interface CompetitorAnalysis {
  // Existing fields
  strengths: string[];
  weaknesses: string[];
  featureGaps: string[];
  userSegments: string[];
  competitivePositioning: string;

  // New
  problemDomainGaps: {
    need: string;
    currentState: string; // How competitors fail here
    proposedSolution: string; // From user annotations
    strategicValue: string; // Why this matters
  }[];
  marketEvidence: {
    volume: string;
    trend: string;
    sentiment: string;
  };
}
```

## Component 5: Blueprint Integration

### Strategy/Pareto Section Enhancement

Modify prompt in `/lib/blueprint-prompts.ts` for the Pareto section:

```
=== STRATEGIC CONTEXT ===

This blueprint must address THREE levels of competitive advantage:

1. APP-LEVEL IMPROVEMENTS
{weaknesses from review analysis}

2. PROBLEM-DOMAIN DIFFERENTIATION
{for each problemDomainGap}
Unmet Need: {need}
How competitors fail: {currentState}
Our approach: {proposedSolution}
Why it matters: {strategicValue}
{end for}

3. MARKET POSITIONING
Based on {volume} monthly discussions trending {direction}:
- Primary audience sentiment: {sentiment breakdown}
- Position as: {competitivePositioning}

=== INSTRUCTION ===
The 80/20 analysis must prioritize features that:
- Fix the obvious app issues (table stakes)
- Solve the deeper problem-domain gaps (differentiation)
- Align with the proposed solution approaches (strategic intent)
```

## Database Changes

### New Table: `reddit_analyses`

```sql
CREATE TABLE reddit_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competitor_id UUID REFERENCES linked_competitors(id),
  search_config JSONB NOT NULL,
  unmet_needs JSONB NOT NULL,
  trends JSONB NOT NULL,
  sentiment JSONB NOT NULL,
  language_patterns TEXT[],
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### New Table: `unmet_need_solutions`

```sql
CREATE TABLE unmet_need_solutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reddit_analysis_id UUID REFERENCES reddit_analyses(id),
  need_id TEXT NOT NULL,
  solution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reddit_analysis_id, need_id)
);
```

### Modify: `linked_competitors`

Add column:
```sql
ALTER TABLE linked_competitors
ADD COLUMN reddit_analysis_id UUID REFERENCES reddit_analyses(id);
```

## API Endpoints

### POST `/api/reddit/generate-config`

Generate search configuration from app metadata + reviews.

Input: `{ competitorId: string }`
Output: `RedditSearchConfig`

### POST `/api/reddit/analyze`

Execute Reddit scraping and AI analysis.

Input: `RedditSearchConfig`
Output: `RedditAnalysisResult`

### PUT `/api/reddit/solutions`

Save user solution annotations.

Input: `{ analysisId: string, solutions: { needId: string, notes: string }[] }`
Output: `{ success: boolean }`

### GET `/api/reddit/analysis/:competitorId`

Fetch existing Reddit analysis for a competitor.

Output: `RedditAnalysisResult | null`

## File Changes Summary

### New Files

- `/app/api/reddit/generate-config/route.ts` - Config generation endpoint
- `/app/api/reddit/analyze/route.ts` - Analysis execution endpoint
- `/app/api/reddit/solutions/route.ts` - Solution notes endpoint
- `/app/api/reddit/analysis/[competitorId]/route.ts` - Fetch analysis
- `/lib/reddit/config-generator.ts` - Auto-generation logic
- `/lib/reddit/analyzer.ts` - Semantic analysis prompts
- `/lib/reddit/types.ts` - TypeScript interfaces
- `/components/reddit/SearchConfigPanel.tsx` - Configuration UI
- `/components/reddit/UnmetNeedsPanel.tsx` - Results left column
- `/components/reddit/TrendsSentimentPanel.tsx` - Results right column
- `/components/reddit/UnmetNeedCard.tsx` - Individual need with solution textarea

### Modified Files

- `/lib/opportunity/review-analyzer.ts` - Accept Reddit data in analysis
- `/lib/blueprint-prompts.ts` - Enhanced strategy prompts
- `/components/competitors/CompetitorCard.tsx` - Add "Reddit Deep Dive" button
- `/components/competitors/CompetitorDetail.tsx` - Show Reddit results
- `/crawl-service/crawlers/reddit.py` - Extend for deeper scraping
- `/lib/supabase.ts` - Add Reddit analysis CRUD operations

## Success Criteria

1. User can trigger Reddit deep dive from competitor card
2. Search terms pre-populate intelligently from app + reviews
3. Analysis returns actionable unmet needs with evidence
4. User can annotate each need with solution approach
5. Combined analysis merges both data sources coherently
6. Blueprint strategy explicitly addresses problem-domain gaps
7. The resulting blueprint produces apps that solve REAL problems, not just UX complaints

## Out of Scope (for v1)

- Automatic subreddit discovery beyond category mapping
- Historical trend analysis (multiple snapshots over time)
- Competitor comparison across multiple Reddit analyses
- Export Reddit analysis as standalone report
- Real-time Reddit monitoring/alerts
