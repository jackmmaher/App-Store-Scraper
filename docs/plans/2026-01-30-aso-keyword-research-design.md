# ASO Keyword Research System Design

## Overview

Build an App Store keyword research tool that surfaces high-volume, low-competition keywords - a "quasi-Ahrefs for apps" using only publicly available data (no Apple Search Ads account required).

## Goals

1. **Discover keywords** via three methods: seed expansion, competitor extraction, category crawling
2. **Score keywords** with Volume, Difficulty, and Opportunity metrics (0-100 scale)
3. **Surface opportunities** - high volume + low competition keywords
4. **Track trends** - historical scoring for keyword monitoring

## Data Sources (No Auth Required)

| Source | URL | Data |
|--------|-----|------|
| iTunes Search API | `https://itunes.apple.com/search` | Top 200 apps per keyword, full metadata |
| iTunes Autosuggest | `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints` | Suggestions + priority scores |
| iTunes RSS | `https://rss.itunes.apple.com/` | Top 200 apps per category |
| Claude API | (existing) | Keyword extraction from text |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEYWORD DISCOVERY LAYER                      │
├─────────────────┬─────────────────────┬─────────────────────────┤
│  Seed Expansion │ Competitor Extract  │   Category Crawl        │
│  (Autosuggest)  │ (Claude + NLP)      │   (Top 200 per cat)     │
└────────┬────────┴──────────┬──────────┴────────────┬────────────┘
         │                   │                       │
         ▼                   ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                 KEYWORD SCORING PIPELINE                        │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐        │
│  │ Volume Proxy │  │  Difficulty  │  │  Opportunity   │        │
│  │   (0-100)    │  │   (0-100)    │  │    (0-100)     │        │
│  └──────────────┘  └──────────────┘  └────────────────┘        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE STORAGE                           │
│  keywords │ keyword_rankings │ keyword_history │ keyword_jobs   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API + UI                                │
│  Search │ Filter │ Sort by Opportunity │ Export │ Track         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scoring Formulas

### Volume Score (0-100)

Estimates search popularity without Apple Search Ads data.

| Factor | Weight | Source |
|--------|--------|--------|
| Autosuggest Priority | 40% | Priority value from hints API |
| Autosuggest Position | 20% | Position 1-10 in suggestions |
| Market Size Proxy | 25% | Total reviews in top 10 apps |
| Trigger Length | 15% | Characters needed to trigger suggestion |

```python
volume_score = (
    (priority / 15000 * 100) * 0.40 +                    # Priority
    (max(110 - position * 10, 0)) * 0.20 +              # Position
    (min(log10(total_reviews + 1) * 15, 100)) * 0.25 +  # Market size
    (max(100 - trigger_chars * 10, 0)) * 0.15           # Trigger length
)
```

### Difficulty Score (0-100)

Measures how hard it is to rank in top 10.

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Title Match Density | 30% | Apps in top 10 with keyword in title × 10 |
| Review Strength | 35% | log10(geometric_mean(reviews)) × 20 |
| Rating Quality | 10% | (avg_rating / 5) × 100 |
| Result Saturation | 10% | (total_results / 200) × 100 |
| Market Maturity | 15% | log10(avg_age_days) × 30 |

```python
difficulty_score = (
    title_score * 0.30 +
    review_score * 0.35 +
    rating_score * 0.10 +
    saturation_score * 0.10 +
    maturity_score * 0.15
)
```

### Opportunity Score (0-100)

The golden metric - high volume with low competition.

```python
opportunity_score = (volume_score * (100 - difficulty_score)) / 100
```

| Volume | Difficulty | Opportunity | Verdict |
|--------|------------|-------------|---------|
| 80 | 20 | 64 | Great target |
| 80 | 80 | 16 | Too competitive |
| 30 | 20 | 24 | Low volume niche |

---

## Database Schema

```sql
-- Core keywords table
CREATE TABLE keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'us',

    -- Scores
    volume_score NUMERIC(4,1),
    difficulty_score NUMERIC(4,1),
    opportunity_score NUMERIC(4,1),

    -- Raw metrics
    autosuggest_priority INTEGER,
    autosuggest_position INTEGER,
    trigger_chars INTEGER,
    total_results INTEGER,
    top10_avg_reviews NUMERIC,
    top10_avg_rating NUMERIC(2,1),
    top10_title_matches INTEGER,

    -- Discovery metadata
    discovered_via TEXT,  -- 'autosuggest', 'competitor', 'category_crawl'
    source_app_id TEXT,
    source_category TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    scored_at TIMESTAMPTZ,

    UNIQUE(keyword, country)
);

-- Keyword rankings (which apps rank for which keywords)
CREATE TABLE keyword_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    rank_position INTEGER,
    has_keyword_in_title BOOLEAN,
    app_review_count INTEGER,
    app_rating NUMERIC(2,1),
    scraped_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(keyword_id, app_id)
);

-- Historical tracking
CREATE TABLE keyword_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
    volume_score NUMERIC(4,1),
    difficulty_score NUMERIC(4,1),
    opportunity_score NUMERIC(4,1),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Background job queue
CREATE TABLE keyword_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,  -- 'discover_seed', 'discover_competitor', 'discover_category', 'score_bulk'
    status TEXT NOT NULL DEFAULT 'pending',
    params JSONB NOT NULL,
    total_items INTEGER,
    processed_items INTEGER DEFAULT 0,
    keywords_discovered INTEGER DEFAULT 0,
    keywords_scored INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_keywords_opportunity ON keywords(opportunity_score DESC);
CREATE INDEX idx_keywords_country ON keywords(country);
CREATE INDEX idx_keywords_volume ON keywords(volume_score DESC);
CREATE INDEX idx_keywords_difficulty ON keywords(difficulty_score ASC);
CREATE INDEX idx_keyword_rankings_keyword ON keyword_rankings(keyword_id);
CREATE INDEX idx_keyword_jobs_status ON keyword_jobs(status);
```

---

## Discovery Methods

### 1. Seed Keyword Expansion

Recursively expand a seed keyword via autosuggest API.

```
Input: "photo"
Output: "photo editor", "photo collage", "photo editor free",
        "photo collage maker", "photo booth", ...
```

- Depth parameter controls recursion (default: 2)
- Deduplicates across expansions
- Captures priority score and trigger position

### 2. Competitor Keyword Extraction

Use Claude to extract keywords from app metadata + reviews.

```
Input: App ID (e.g., "12345678")
Process:
  1. Fetch app name, subtitle, description
  2. Fetch 100 recent reviews
  3. Claude extracts search keywords:
     - Feature keywords ("photo editor", "background remover")
     - Use-case keywords ("edit selfies", "passport photo")
     - Problem keywords ("remove watermark")
     - Comparison keywords ("photoshop alternative")
Output: 20-50 relevant keywords
```

### 3. Category Crawl

Extract keywords from top 200 apps in a category.

```
Input: Category (e.g., "6002" for Utilities)
Process:
  1. Fetch top 200 apps via RSS
  2. Extract n-grams from all titles/subtitles
  3. Count frequency (min 2 occurrences)
  4. Claude filters to valid search keywords
Output: Category-relevant keywords
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/keywords/discover` | Queue discovery job |
| POST | `/api/keywords/score` | Score single keyword |
| GET | `/api/keywords/search` | Search/filter keywords |
| GET | `/api/keywords/[id]/history` | Historical scores |
| POST | `/api/keywords/bulk-score` | Queue bulk scoring |
| GET | `/api/keywords/export` | Export CSV/JSON |
| GET | `/api/keywords/jobs/[id]/stream` | SSE job progress |

### Query Parameters for `/search`

- `q` - Keyword search text
- `country` - Country code (default: us)
- `sort` - `opportunity`, `volume`, `difficulty`
- `min_volume` - Minimum volume score
- `max_difficulty` - Maximum difficulty score
- `discovered_via` - Filter by discovery method
- `page`, `limit` - Pagination

---

## Background Processing

### Job Types

1. `discover_seed` - Expand seed keyword
2. `discover_competitor` - Extract from app
3. `discover_category` - Crawl category
4. `score_bulk` - Score multiple keywords
5. `rescore_all` - Refresh stale scores

### Worker Process

Python worker polls for pending jobs:
1. Claim job atomically (prevent duplicates)
2. Process based on job type
3. Update progress incrementally
4. Mark complete or failed

### Cron Schedule

| Job | Schedule | Description |
|-----|----------|-------------|
| Process queue | Every 5 min | Run pending jobs |
| Rescore stale | Daily 4 AM | Refresh keywords not scored in 7 days |

---

## File Structure

```
/api
  /keywords
    /discover/route.ts
    /score/route.ts
    /search/route.ts
    /export/route.ts
    /bulk-score/route.ts
    /jobs/[id]/stream/route.ts
  /cron
    /rescore-keywords/route.ts
    /process-keyword-jobs/route.ts

/lib
  /keywords
    scoring.ts
    discovery.ts
    autosuggest.ts

/python
  /keywords
    worker.py
    autosuggest.py
    scoring.py
```

---

## UI Components

### Keyword Research Table

| Keyword | Vol | Diff | Opp | Source | Actions |
|---------|-----|------|-----|--------|---------|
| photo editor | 78 | 85 | 12 | seed | View · Track |
| photo collage maker | 52 | 34 | 34 | seed | View · Track |

### Filters

- Volume range slider
- Difficulty range slider
- Discovery source dropdown
- Country selector

### Discovery Panel

- Seed input + expand button
- App ID input + extract button
- Category dropdown + crawl button
- Active jobs with progress bars

---

## Implementation Phases

### Phase 1: Core Scoring
- [ ] Autosuggest API client
- [ ] iTunes search integration (extend existing)
- [ ] Scoring functions (volume, difficulty, opportunity)
- [ ] Database schema + migrations

### Phase 2: Discovery
- [ ] Seed expansion endpoint
- [ ] Competitor extraction with Claude
- [ ] Category crawl endpoint
- [ ] Job queue table + worker

### Phase 3: API + Search
- [ ] Keyword search endpoint with filters
- [ ] Export endpoint (CSV/JSON)
- [ ] SSE streaming for job progress

### Phase 4: UI
- [ ] Keyword research table component
- [ ] Discovery panel
- [ ] Filters + sorting
- [ ] Job progress display

### Phase 5: Automation
- [ ] Vercel cron setup
- [ ] Stale keyword rescoring
- [ ] Historical tracking + trends

---

## References

- [AppFollow Keyword Difficulty](https://support.appfollow.io/hc/en-us/articles/360020832017-Keyword-Difficulty-Score)
- [AppTweak Difficulty/Chance](https://www.apptweak.com/en/aso-blog/ranking-difficulty-chance-score-now-on-apptweak)
- [MobileAction Search Popularity Decoded](https://www.mobileaction.co/blog/app-store-optimization/apple-search-popularity-decoded/)
- [Open-source ASO tool](https://github.com/facundoolano/aso)
