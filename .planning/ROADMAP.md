# Reddit Deep Dive - Implementation Roadmap

## Phase 1: Foundation (Types, Database, Config Generator)

**Goal:** Establish data structures, database tables, and the config generation logic that auto-derives search terms from app metadata + reviews.

**Components:**
- TypeScript types for Reddit analysis (`lib/reddit/types.ts`)
- Database tables: `reddit_analyses`, `unmet_need_solutions`
- Config generator with Claude prompt to extract problem domain from reviews
- API endpoint: `POST /api/reddit/generate-config`

**Dependencies:** None
**Research:** No

---

## Phase 2: Reddit Deep Scraping & AI Analysis

**Goal:** Extend the Python Reddit crawler for deeper scraping, and implement the AI semantic analysis that extracts unmet needs, trends, and sentiment.

**Components:**
- Enhanced Reddit crawler with subreddit-specific search, comment fetching
- AI analyzer prompt for semantic extraction (unmet needs, severity, evidence)
- API endpoint: `POST /api/reddit/analyze`
- API endpoint: `GET /api/reddit/analysis/[competitorId]`

**Dependencies:** Phase 1 (types)
**Research:** No

---

## Phase 3: Solution Annotations & Storage

**Goal:** Allow users to annotate each unmet need with their solution approach, persist to database.

**Components:**
- API endpoint: `PUT /api/reddit/solutions`
- Database CRUD for solution notes
- Link reddit_analysis_id to linked_competitors

**Dependencies:** Phase 2 (analysis data exists)
**Research:** No

---

## Phase 4: Frontend UI - Config Panel & Results Display

**Goal:** Build the React components for search configuration and results display.

**Components:**
- `SearchConfigPanel.tsx` - Pre-populated search terms, user refinement
- `UnmetNeedsPanel.tsx` - Left column with needs + solution textareas
- `TrendsSentimentPanel.tsx` - Right column with trends/sentiment
- `UnmetNeedCard.tsx` - Individual need card with annotation
- Integration into competitor detail page
- "Reddit Deep Dive" button on competitor card

**Dependencies:** Phase 2, 3 (API endpoints working)
**Research:** No

---

## Phase 5: Enhanced AI Analysis Integration

**Goal:** Modify the existing competitor analysis to combine reviews + Reddit + annotations.

**Components:**
- Update `analyze/route.ts` to accept Reddit data
- Enhanced Claude prompt with Reddit market insights section
- Output includes `problemDomainGaps` and `marketEvidence`

**Dependencies:** Phase 3 (solution annotations available)
**Research:** No

---

## Phase 6: Blueprint Pipeline Integration

**Goal:** Feed the enhanced competitive intelligence into the blueprint strategy/Pareto section.

**Components:**
- Update `/lib/blueprint-prompts.ts` Pareto section prompt
- Include problem-domain gaps, user solutions, market evidence
- Strategy explicitly addresses both app-level and problem-domain differentiation

**Dependencies:** Phase 5 (enhanced analysis output)
**Research:** No

---

## Success Criteria

1. User can trigger Reddit deep dive from competitor card
2. Search terms pre-populate intelligently from app + reviews
3. Analysis returns actionable unmet needs with evidence
4. User can annotate each need with solution approach
5. Combined analysis merges both data sources coherently
6. Blueprint strategy explicitly addresses problem-domain gaps
